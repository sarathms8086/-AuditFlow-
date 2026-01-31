/**
 * Sync Manager
 * 
 * Handles synchronization of offline audits with the backend.
 * Features:
 * - Network detection
 * - Retry with exponential backoff
 * - Progress callbacks
 * - Auto token refresh
 */

import { getPendingAudits, getAuditPhotos, markAuditSynced, blobToBase64, cleanupSyncedAuditPhotos } from './db';
import { getValidAccessToken } from './tokenManager';

// API URL - empty for same-origin (Vercel), or external URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Sync state
let isSyncing = false;
let syncListeners = [];

/**
 * Add sync listener
 */
export function addSyncListener(callback) {
    syncListeners.push(callback);
    return () => {
        syncListeners = syncListeners.filter((cb) => cb !== callback);
    };
}

/**
 * Notify all listeners
 */
function notifyListeners(event) {
    syncListeners.forEach((cb) => cb(event));
}

/**
 * Check if online
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Submit audit to backend
 */
async function submitAudit(audit, photos) {
    // Get valid token (auto-refreshes if expired)
    const accessToken = await getValidAccessToken();

    // Process photos - use Drive links if already uploaded, otherwise upload directly to Drive
    // CRITICAL: Upload directly to Drive to avoid Vercel's 4.5MB limit!
    let skippedPhotos = 0;
    let directUploads = 0;

    const { uploadBlobToDrive } = await import('./google/directDriveUpload');
    const targetFolderId = audit.driveResources?.photosFolderId || null;

    const photoData = await Promise.all(
        photos.map(async (photo) => {
            try {
                // Check if photo is already uploaded to Drive AND has driveFileId
                if (photo.status === 'uploaded' && photo.driveFileId) {
                    console.log(`[SYNC] Photo ${photo.filename} already in Drive: ${photo.driveFileId}`);
                    return {
                        itemId: photo.itemId,
                        filename: photo.filename,
                        driveFileId: photo.driveFileId,
                        driveLink: photo.driveLink,
                        alreadyUploaded: true,
                    };
                }

                // Photo not uploaded yet - upload DIRECTLY to Drive (bypasses Vercel limit!)
                if (photo.blob) {
                    console.log(`[SYNC] Uploading ${photo.filename} directly to Drive...`);
                    directUploads++;

                    try {
                        const result = await uploadBlobToDrive(
                            photo.blob,
                            photo.filename,
                            targetFolderId,
                            accessToken
                        );

                        console.log(`[SYNC] Direct upload success: ${result.fileId}`);
                        return {
                            itemId: photo.itemId,
                            filename: photo.filename,
                            driveFileId: result.fileId,
                            driveLink: result.webViewLink,
                            alreadyUploaded: true, // Mark as uploaded since we just did it!
                        };
                    } catch (uploadErr) {
                        console.error(`[SYNC] Direct upload failed for ${photo.filename}:`, uploadErr.message);
                        // Return null to skip this photo (it's still in IndexedDB for retry)
                        skippedPhotos++;
                        return null;
                    }
                }

                // No blob and not uploaded - this is a data loss scenario
                console.error(`[SYNC] PHOTO LOST: ${photo.filename} has no blob and no driveFileId! Status: ${photo.status}`);
                skippedPhotos++;
                return null;
            } catch (err) {
                console.error(`[SYNC] Failed to process photo ${photo.filename}:`, err);
                skippedPhotos++;
                return null;
            }
        })
    );

    if (directUploads > 0) {
        console.log(`[SYNC] Uploaded ${directUploads} photos directly to Drive`);
    }

    // Log warning if photos were skipped
    if (skippedPhotos > 0) {
        console.warn(`[SYNC] WARNING: ${skippedPhotos} photos could not be included in submission!`);
    }

    // Prepare checklist with responses
    const checklistWithResponses = JSON.parse(JSON.stringify(audit.checklist));
    for (const section of checklistWithResponses.sections) {
        // Handle new subsections structure
        if (section.subsections && section.subsections.length > 0) {
            for (const sub of section.subsections) {
                for (const item of sub.items || []) {
                    const itemId = item.sl_no || item.slNo || item.item_id;
                    const response = audit.responses[itemId];
                    if (response) {
                        item.response = response.response;
                        item.remarks = response.remarks;
                    }
                }
            }
        }
        // Handle old items structure
        if (section.items) {
            for (const item of section.items) {
                const itemId = item.item_id || item.itemId || item.sl_no || item.slNo;
                const response = audit.responses[itemId];
                if (response) {
                    item.response = response.response;
                    item.remarks = response.remarks;
                }
            }
        }
    }

    const response = await fetch(`${API_URL}/api/audit/submit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            auditData: {
                siteName: audit.siteName,
                clientName: audit.clientName,
                projectCode: audit.projectCode,
                location: audit.location,
                auditDate: audit.createdAt,
                auditorName: audit.auditorName,
                projectManager: audit.projectManager,
                sectionFindings: audit.sectionFindings || {},
                tablePhotos: audit.tablePhotos || {},
                driveResources: audit.driveResources || null, // Pre-created folder/sheet/PPT IDs
            },
            checklist: checklistWithResponses,
            photos: photoData,
            responses: audit.responses, // Pass all responses including table values
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * Sync a single audit with retry
 */
async function syncAuditWithRetry(audit, maxRetries = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            notifyListeners({
                type: 'sync_start',
                auditId: audit.id,
                attempt,
                message: `Syncing "${audit.siteName}" (attempt ${attempt})...`,
            });

            // Get photos for this audit
            const photos = await getAuditPhotos(audit.id);

            // Submit to backend
            const result = await submitAudit(audit, photos);

            // Mark as synced
            await markAuditSynced(audit.id, result);

            // Cleanup photo blobs now that audit is successfully synced
            // This frees up IndexedDB storage while keeping metadata
            try {
                await cleanupSyncedAuditPhotos(audit.id);
            } catch (cleanupErr) {
                console.warn('[SYNC] Blob cleanup failed (non-fatal):', cleanupErr.message);
            }

            notifyListeners({
                type: 'sync_success',
                auditId: audit.id,
                result,
                message: `Successfully synced "${audit.siteName}"`,
            });

            return { success: true, result };
        } catch (err) {
            lastError = err;
            console.error(`[SYNC] Attempt ${attempt} failed:`, err);

            if (attempt < maxRetries) {
                // Exponential backoff
                const delay = Math.pow(2, attempt) * 1000;
                notifyListeners({
                    type: 'sync_retry',
                    auditId: audit.id,
                    attempt,
                    delay,
                    message: `Retrying in ${delay / 1000}s...`,
                });
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    notifyListeners({
        type: 'sync_error',
        auditId: audit.id,
        error: lastError.message,
        message: `Failed to sync "${audit.siteName}": ${lastError.message}`,
    });

    return { success: false, error: lastError };
}

/**
 * Sync all pending audits
 */
export async function syncPendingAudits() {
    if (isSyncing) {
        console.log('[SYNC] Already syncing, skipping...');
        return { synced: 0, failed: 0 };
    }

    if (!isOnline()) {
        console.log('[SYNC] Offline, skipping...');
        return { synced: 0, failed: 0, offline: true };
    }

    isSyncing = true;
    const results = { synced: 0, failed: 0, audits: [] };

    try {
        const pendingAudits = await getPendingAudits();

        if (pendingAudits.length === 0) {
            console.log('[SYNC] No pending audits');
            return results;
        }

        notifyListeners({
            type: 'sync_batch_start',
            count: pendingAudits.length,
            message: `Syncing ${pendingAudits.length} audit(s)...`,
        });

        for (const audit of pendingAudits) {
            const result = await syncAuditWithRetry(audit);
            if (result.success) {
                results.synced++;
            } else {
                results.failed++;
            }
            results.audits.push({ id: audit.id, ...result });
        }

        notifyListeners({
            type: 'sync_batch_complete',
            ...results,
            message: `Sync complete: ${results.synced} synced, ${results.failed} failed`,
        });
    } finally {
        isSyncing = false;
    }

    return results;
}

/**
 * Setup automatic sync on network reconnection
 */
export function setupAutoSync() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
        console.log('[SYNC] Network online, triggering sync...');
        syncPendingAudits();
    });

    // Listen for service worker sync messages
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'SYNC_AUDITS') {
                syncPendingAudits();
            }
        });
    }
}
