/**
 * Background Photo Upload Service
 * 
 * Uploads photos to Google Drive in the background while user continues working.
 * Features:
 * - Automatic upload on capture
 * - Retry on failure with auto token refresh
 * - Cleanup after successful upload
 * - Progress tracking
 */

import { getPhotosByAudit, updatePhotoStatus } from './db';
import { getValidAccessToken } from './tokenManager';

// Upload queue
let uploadQueue = [];
let isUploading = false;
let uploadListeners = [];

// Status constants
export const PHOTO_STATUS = {
    PENDING: 'pending_upload',
    UPLOADING: 'uploading',
    UPLOADED: 'uploaded',
    FAILED: 'failed',
};

/**
 * Add upload progress listener
 */
export function addUploadListener(callback) {
    uploadListeners.push(callback);
    return () => {
        uploadListeners = uploadListeners.filter(cb => cb !== callback);
    };
}

/**
 * Notify listeners of upload progress
 */
function notifyUploadProgress(status) {
    uploadListeners.forEach(cb => cb(status));
}

/**
 * Upload a single photo to Google Drive
 * Uses DIRECT upload to Drive API, bypassing Vercel's 4.5MB limit
 * 
 * @param {Object} photo - Photo object with blob or base64, filename, itemId
 * @param {string} auditId - Audit ID
 * @param {Object} driveResources - Drive resources with photosFolderId
 */
async function uploadPhotoToDrive(photo, auditId, driveResources = null) {
    console.log(`[DIRECT UPLOAD] Starting upload for photo ${photo.id}`);
    console.log(`[DIRECT UPLOAD] - filename: ${photo.filename}`);
    console.log(`[DIRECT UPLOAD] - has blob: ${!!photo.blob}, has base64: ${!!photo.base64}`);
    console.log(`[DIRECT UPLOAD] - auditId: ${auditId}`);

    // Import direct upload function
    const { uploadBlobToDrive } = await import('./google/directDriveUpload');
    const { blobToBase64 } = await import('./db');

    // Get valid token (auto-refreshes if expired)
    console.log('[DIRECT UPLOAD] Getting access token...');
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
        throw new Error('No access token available');
    }
    console.log('[DIRECT UPLOAD] Got access token');

    // Get target folder
    const folderId = driveResources?.photosFolderId || null;
    console.log(`[DIRECT UPLOAD] Target folder: ${folderId || 'root'}`);

    // Get or create blob for upload
    let blob = photo.blob;

    // If we have base64 but no blob, convert base64 back to blob
    if (!blob && photo.base64) {
        console.log('[DIRECT UPLOAD] Converting base64 to blob...');
        const mimeType = photo.mimeType || 'image/jpeg';
        const byteCharacters = atob(photo.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray], { type: mimeType });
        console.log(`[DIRECT UPLOAD] Created blob: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    }

    if (!blob) {
        throw new Error('No blob or base64 data available for upload');
    }

    console.log(`[DIRECT UPLOAD] Uploading ${(blob.size / 1024 / 1024).toFixed(2)} MB to Drive...`);

    // Upload directly to Google Drive (no size limit!)
    const result = await uploadBlobToDrive(
        blob,
        photo.filename,
        folderId,
        accessToken
    );

    console.log(`[DIRECT UPLOAD] Success! File ID: ${result.fileId}`);

    return {
        fileId: result.fileId,
        webViewLink: result.webViewLink,
    };
}

/**
 * Process upload queue with auto-retry
 * Retries up to MAX_RETRIES times before marking as failed
 */
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds between retries

async function processQueue() {
    console.log(`[DEBUG] processQueue called. isUploading=${isUploading}, queueLength=${uploadQueue.length}`);

    if (isUploading) {
        console.log('[DEBUG] processQueue: Already uploading, returning early');
        return;
    }

    if (uploadQueue.length === 0) {
        console.log('[DEBUG] processQueue: Queue is empty, returning early');
        return;
    }

    isUploading = true;
    console.log('[DEBUG] processQueue: Set isUploading=true, starting processing');

    try {
        while (uploadQueue.length > 0) {
            const { photo, auditId, driveResources, resolve, reject, retryCount = 0 } = uploadQueue[0];

            try {
                // Update status to uploading
                await updatePhotoStatus(photo.id, PHOTO_STATUS.UPLOADING, {
                    retryCount,
                });

                notifyUploadProgress({
                    type: 'uploading',
                    photoId: photo.id,
                    pending: uploadQueue.length,
                    retryCount,
                });

                // Upload to Drive (with real-time sync if driveResources available)
                const result = await uploadPhotoToDrive(photo, auditId, driveResources);

                // Update photo record with Drive info
                // NOTE: Blob is no longer deleted here - it will be cleaned up after audit sync
                // This ensures photos can be re-uploaded if submission fails
                await updatePhotoStatus(photo.id, PHOTO_STATUS.UPLOADED, {
                    driveFileId: result.fileId,
                    driveLink: result.webViewLink,
                    uploadedAt: new Date().toISOString(),
                    retryCount,
                });

                // Blob cleanup moved to db.js cleanupSyncedAuditPhotos() - called after audit sync
                console.log(`[UPLOAD] Photo ${photo.filename} uploaded, blob retained for sync backup`);

                notifyUploadProgress({
                    type: 'uploaded',
                    photoId: photo.id,
                    fileId: result.fileId,
                    pending: uploadQueue.length - 1,
                });

                resolve(result);
            } catch (err) {
                console.error(`[UPLOAD] Failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, err.message);

                // Check if we should retry
                if (retryCount < MAX_RETRIES - 1) {
                    console.log(`[UPLOAD] Will retry in ${RETRY_DELAY_MS}ms...`);

                    // Remove from front and add to back with incremented retry count
                    uploadQueue.shift();
                    uploadQueue.push({
                        photo,
                        auditId,
                        driveResources,
                        resolve,
                        reject,
                        retryCount: retryCount + 1,
                    });

                    // Update status to show retrying
                    await updatePhotoStatus(photo.id, PHOTO_STATUS.PENDING, {
                        retryCount: retryCount + 1,
                        lastError: err.message,
                        lastAttempt: new Date().toISOString(),
                    });

                    notifyUploadProgress({
                        type: 'retrying',
                        photoId: photo.id,
                        retryCount: retryCount + 1,
                        pending: uploadQueue.length,
                    });

                    // Wait before processing next
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                    continue; // Skip the shift at the end
                }

                // Max retries reached - mark as failed
                await updatePhotoStatus(photo.id, PHOTO_STATUS.FAILED, {
                    error: err.message,
                    lastAttempt: new Date().toISOString(),
                    retryCount: retryCount + 1,
                });

                notifyUploadProgress({
                    type: 'failed',
                    photoId: photo.id,
                    error: err.message,
                    pending: uploadQueue.length - 1,
                });

                reject(err);
            }

            // Remove from queue
            uploadQueue.shift();
        }
    } finally {
        // CRITICAL: Always reset isUploading flag to prevent queue from getting stuck
        isUploading = false;
    }

    notifyUploadProgress({
        type: 'complete',
        pending: 0,
    });
}

/**
 * Queue a photo for background upload
 * @param {Object} photo - Photo object
 * @param {string} auditId - Audit ID
 * @param {Object} driveResources - Optional drive resources for real-time sync
 */
export function queuePhotoUpload(photo, auditId, driveResources = null) {
    console.log(`[DEBUG] queuePhotoUpload called for photo ${photo.id}`);
    console.log(`[DEBUG] - Current queue length: ${uploadQueue.length}`);
    console.log(`[DEBUG] - isUploading: ${isUploading}`);
    console.log(`[DEBUG] - has base64: ${!!photo.base64}, length: ${photo.base64?.length || 0}`);
    console.log(`[DEBUG] - has blob: ${!!photo.blob}`);

    return new Promise((resolve, reject) => {
        uploadQueue.push({ photo, auditId, driveResources, resolve, reject });
        console.log(`[DEBUG] Photo added to queue. New queue length: ${uploadQueue.length}`);

        notifyUploadProgress({
            type: 'queued',
            photoId: photo.id,
            pending: uploadQueue.length,
        });

        // Start processing if not already
        console.log('[DEBUG] Calling processQueue from queuePhotoUpload');
        processQueue();
    });
}

/**
 * Get upload status for an audit
 */
export async function getUploadStatus(auditId) {
    const photos = await getPhotosByAudit(auditId);

    const pending = photos.filter(p => p.status === PHOTO_STATUS.PENDING || p.status === PHOTO_STATUS.UPLOADING);
    const uploaded = photos.filter(p => p.status === PHOTO_STATUS.UPLOADED);
    const failed = photos.filter(p => p.status === PHOTO_STATUS.FAILED);

    return {
        total: photos.length,
        pending: pending.length,
        uploaded: uploaded.length,
        failed: failed.length,
        allUploaded: pending.length === 0 && failed.length === 0,
        isUploading,
    };
}

/**
 * Retry failed uploads for an audit
 */
export async function retryFailedUploads(auditId) {
    console.log(`[DEBUG] ========== retryFailedUploads START ==========`);
    console.log(`[DEBUG] auditId: ${auditId}`);
    console.log(`[DEBUG] Current isUploading: ${isUploading}`);
    console.log(`[DEBUG] Current queue length: ${uploadQueue.length}`);

    try {
        const { getAudit, getPhotosByAudit, compressImage } = await import('./db');
        console.log('[DEBUG] Imported db functions successfully');

        // Get audit to access driveResources
        const audit = await getAudit(auditId);
        console.log(`[DEBUG] Audit found: ${!!audit}`);

        if (!audit) {
            console.error(`[DEBUG] Cannot retry: Audit ${auditId} not found`);
            return 0;
        }

        console.log(`[DEBUG] Audit driveResources: ${JSON.stringify(audit.driveResources)}`);

        const photos = await getPhotosByAudit(auditId);
        console.log(`[DEBUG] Total photos in audit: ${photos.length}`);

        const failed = photos.filter(p => p.status === PHOTO_STATUS.FAILED);
        console.log(`[DEBUG] Failed photos found: ${failed.length}`);

        failed.forEach((p, i) => {
            console.log(`[DEBUG] Failed photo ${i + 1}: id=${p.id}, hasBlob=${!!p.blob}, hasBase64=${!!p.base64}`);
        });

        let queuedCount = 0;

        for (const photo of failed) {
            console.log(`[DEBUG] Processing failed photo: ${photo.id}`);
            try {
                let base64 = photo.base64;
                console.log(`[DEBUG] - Initial base64: ${base64 ? 'EXISTS (len=' + base64.length + ')' : 'NULL'}`);

                // Convert blob to base64 with compression if needed
                if (!base64 && photo.blob) {
                    console.log('[DEBUG] - Compressing blob before upload...');
                    base64 = await compressImage(photo.blob);
                    console.log(`[DEBUG] - Compressed base64 length: ${base64?.length || 0}`);
                }

                if (!base64) {
                    console.warn(`[DEBUG] Cannot retry photo ${photo.id}: No base64 or blob data available`);
                    continue;
                }

                // Queue without awaiting - let the queue process asynchronously
                // Using .catch() to prevent unhandled rejections
                console.log(`[DEBUG] Queuing photo ${photo.id} for upload...`);
                queuePhotoUpload({
                    ...photo,
                    base64,
                }, auditId, audit.driveResources).catch(err => {
                    console.warn(`[DEBUG] Retry upload failed for photo ${photo.id}:`, err.message);
                });

                queuedCount++;
                console.log(`[DEBUG] Photo ${photo.id} queued successfully. Total queued: ${queuedCount}`);
            } catch (err) {
                console.error(`[DEBUG] Failed to prepare retry for photo ${photo.id}:`, err);
            }
        }

        console.log(`[DEBUG] ========== retryFailedUploads END ==========`);
        console.log(`[DEBUG] Total queued: ${queuedCount}`);
        console.log(`[DEBUG] Final isUploading: ${isUploading}`);
        console.log(`[DEBUG] Final queue length: ${uploadQueue.length}`);
        return queuedCount;
    } catch (err) {
        console.error('[DEBUG] Error in retryFailedUploads:', err);
        throw err;
    }
}

/**
 * Check if all photos are uploaded for an audit
 */
export async function areAllPhotosUploaded(auditId) {
    const status = await getUploadStatus(auditId);
    return status.allUploaded;
}

/**
 * Retry all pending/failed uploads across all audits
 * Called when connection is restored
 */
export async function retryAllPendingUploads() {
    try {
        const { getAllAudits, getPhotosByAudit, compressImage } = await import('./db');
        const audits = await getAllAudits();
        let totalRetried = 0;

        for (const audit of audits) {
            if (audit.status === 'synced') continue;

            const photos = await getPhotosByAudit(audit.id);
            const pendingPhotos = photos.filter(p =>
                (p.status === PHOTO_STATUS.PENDING || p.status === PHOTO_STATUS.FAILED) && p.blob
            );

            for (const photo of pendingPhotos) {
                try {
                    // Use compression to ensure image is under size limit
                    const base64 = await compressImage(photo.blob);
                    queuePhotoUpload({
                        ...photo,
                        base64,
                    }, audit.id, audit.driveResources).catch(err => {
                        console.warn(`[UPLOAD] Retry failed for photo ${photo.id}:`, err.message);
                    });
                    totalRetried++;
                } catch (err) {
                    console.warn(`[UPLOAD] Failed to prepare photo ${photo.id} for retry:`, err.message);
                }
            }
        }

        if (totalRetried > 0) {
            console.log(`[UPLOAD] Queued ${totalRetried} photos for retry`);
        }

        return totalRetried;
    } catch (err) {
        console.error('[UPLOAD] Error retrying pending uploads:', err);
        return 0;
    }
}

// Auto-retry on reconnection (browser only)
if (typeof window !== 'undefined') {
    let wasOffline = !navigator.onLine;

    window.addEventListener('online', () => {
        if (wasOffline) {
            console.log('[UPLOAD] Back online, retrying pending uploads...');
            // Small delay to ensure connection is stable
            setTimeout(() => {
                retryAllPendingUploads();
            }, 2000);
        }
        wasOffline = false;
    });

    window.addEventListener('offline', () => {
        wasOffline = true;
        console.log('[UPLOAD] Gone offline, uploads paused');
    });
}
