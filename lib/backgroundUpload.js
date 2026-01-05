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
 */
async function uploadPhotoToDrive(photo, auditId) {
    // Get valid token (auto-refreshes if expired)
    const accessToken = await getValidAccessToken();

    // Call the API to upload photo
    const response = await fetch('/api/photos/upload', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            auditId,
            itemId: photo.itemId,
            filename: photo.filename,
            base64: photo.base64,
            mimeType: photo.mimeType || 'image/jpeg',
        }),
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
        const { photo, auditId, resolve, reject } = uploadQueue[0];

        try {
            // Update status to uploading
            await updatePhotoStatus(photo.id, PHOTO_STATUS.UPLOADING);

            notifyUploadProgress({
                type: 'uploading',
                photoId: photo.id,
                pending: uploadQueue.length,
            });

            // Upload to Drive
            const result = await uploadPhotoToDrive(photo, auditId);

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
 */
export function queuePhotoUpload(photo, auditId) {
    return new Promise((resolve, reject) => {
        uploadQueue.push({ photo, auditId, resolve, reject });

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
