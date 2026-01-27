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

import { getPhotosByAudit, updatePhotoStatus, deletePhotoBlob } from './db';
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
 * @param {Object} photo - Photo object with base64, filename, itemId
 * @param {string} auditId - Audit ID
 * @param {Object} driveResources - Optional drive resources for real-time sync
 */
async function uploadPhotoToDrive(photo, auditId, driveResources = null) {
    // Get valid token (auto-refreshes if expired)
    const accessToken = await getValidAccessToken();

    // Build request body
    const body = {
        auditId,
        itemId: photo.itemId,
        filename: photo.filename,
        base64: photo.base64,
        mimeType: photo.mimeType || 'image/jpeg',
    };

    // Add real-time sync params if driveResources available
    // Photos go to the main Photos folder during audit
    // Submit route will organize them into section folders and create proper PPT
    if (driveResources && driveResources.photosFolderId) {
        body.targetFolderId = driveResources.photosFolderId;
        console.log(`[UPLOAD] Using pre-created Photos folder: ${driveResources.photosFolderId}`);
    }

    // Call the API to upload photo
    const response = await fetch('/api/photos/upload', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Upload failed');
    }

    return response.json();
}

/**
 * Process upload queue
 */
async function processQueue() {
    if (isUploading || uploadQueue.length === 0) return;

    isUploading = true;

    while (uploadQueue.length > 0) {
        const { photo, auditId, driveResources, resolve, reject } = uploadQueue[0];

        try {
            // Update status to uploading
            await updatePhotoStatus(photo.id, PHOTO_STATUS.UPLOADING);

            notifyUploadProgress({
                type: 'uploading',
                photoId: photo.id,
                pending: uploadQueue.length,
            });

            // Upload to Drive (with real-time sync if driveResources available)
            const result = await uploadPhotoToDrive(photo, auditId, driveResources);

            // Update photo record with Drive info and remove blob
            await updatePhotoStatus(photo.id, PHOTO_STATUS.UPLOADED, {
                driveFileId: result.fileId,
                driveLink: result.webViewLink,
                uploadedAt: new Date().toISOString(),
            });

            // Delete the blob from IndexedDB to free space
            await deletePhotoBlob(photo.id);

            notifyUploadProgress({
                type: 'uploaded',
                photoId: photo.id,
                fileId: result.fileId,
                pending: uploadQueue.length - 1,
            });

            resolve(result);
        } catch (err) {
            console.error('[UPLOAD] Failed:', err);

            await updatePhotoStatus(photo.id, PHOTO_STATUS.FAILED, {
                error: err.message,
                lastAttempt: new Date().toISOString(),
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

    isUploading = false;

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
    return new Promise((resolve, reject) => {
        uploadQueue.push({ photo, auditId, driveResources, resolve, reject });

        notifyUploadProgress({
            type: 'queued',
            photoId: photo.id,
            pending: uploadQueue.length,
        });

        // Start processing if not already
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
    const photos = await getPhotosByAudit(auditId);
    const failed = photos.filter(p => p.status === PHOTO_STATUS.FAILED);

    for (const photo of failed) {
        queuePhotoUpload(photo, auditId);
    }

    return failed.length;
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
        const { getAllAudits, getPhotosByAudit, blobToBase64 } = await import('./db');
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
                    const base64 = await blobToBase64(photo.blob);
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
