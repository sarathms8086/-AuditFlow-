/**
 * IndexedDB Wrapper for Offline Storage
 * 
 * Stores:
 * - In-progress audits
 * - Captured photos (as blobs)
 * - Sync status
 */

const DB_NAME = 'auditflow';
const DB_VERSION = 1;

let db = null;

/**
 * Initialize IndexedDB
 */
export async function initDB() {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Audits store
            if (!database.objectStoreNames.contains('audits')) {
                const auditStore = database.createObjectStore('audits', { keyPath: 'id' });
                auditStore.createIndex('status', 'status', { unique: false });
                auditStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // Photos store
            if (!database.objectStoreNames.contains('photos')) {
                const photoStore = database.createObjectStore('photos', { keyPath: 'id' });
                photoStore.createIndex('auditId', 'auditId', { unique: false });
                photoStore.createIndex('itemId', 'itemId', { unique: false });
            }
        };
    });
}

/**
 * Generate unique ID
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================================================
// AUDIT OPERATIONS
// =============================================================================

/**
 * Create a new audit
 */
export async function createAudit(auditData) {
    await initDB();

    const audit = {
        id: generateId(),
        ...auditData,
        status: 'draft', // draft, in_progress, completed, synced
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        checklist: auditData.checklist || null,
        responses: {}, // itemId -> { response, remarks }
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('audits', 'readwrite');
        const store = transaction.objectStore('audits');
        const request = store.add(audit);

        request.onsuccess = () => resolve(audit);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get audit by ID
 */
export async function getAudit(id) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('audits', 'readonly');
        const store = transaction.objectStore('audits');
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Update audit
 */
export async function updateAudit(id, updates) {
    await initDB();

    const audit = await getAudit(id);
    if (!audit) throw new Error('Audit not found');

    const updatedAudit = {
        ...audit,
        ...updates,
        updatedAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('audits', 'readwrite');
        const store = transaction.objectStore('audits');
        const request = store.put(updatedAudit);

        request.onsuccess = () => resolve(updatedAudit);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Update response for a checklist item
 */
export async function updateItemResponse(auditId, itemId, response, remarks = '') {
    const audit = await getAudit(auditId);
    if (!audit) throw new Error('Audit not found');

    const responses = { ...audit.responses };
    responses[itemId] = { response, remarks, updatedAt: new Date().toISOString() };

    return updateAudit(auditId, { responses, status: 'in_progress' });
}

/**
 * Get all audits
 */
export async function getAllAudits() {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('audits', 'readonly');
        const store = transaction.objectStore('audits');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all pending (unsynced) audits
 */
export async function getPendingAudits() {
    const audits = await getAllAudits();
    return audits.filter((a) => a.status === 'completed');
}

/**
 * Mark audit as synced
 */
export async function markAuditSynced(id, syncResult) {
    return updateAudit(id, {
        status: 'synced',
        syncedAt: new Date().toISOString(),
        syncResult,
    });
}

/**
 * Delete audit
 */
export async function deleteAudit(id) {
    await initDB();

    // Delete photos first
    await deleteAuditPhotos(id);

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('audits', 'readwrite');
        const store = transaction.objectStore('audits');
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// =============================================================================
// PHOTO OPERATIONS
// =============================================================================

/**
 * Save a photo (with upload status tracking)
 */
export async function savePhoto(auditId, itemId, blob, filename) {
    await initDB();

    const photo = {
        id: generateId(),
        auditId,
        itemId,
        blob,
        filename: filename || `photo_${Date.now()}.jpg`,
        mimeType: blob.type || 'image/jpeg',
        status: 'pending_upload', // pending_upload, uploading, uploaded, failed
        createdAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('photos', 'readwrite');
        const store = transaction.objectStore('photos');
        const request = store.add(photo);

        request.onsuccess = () => resolve(photo);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get a single photo by ID
 */
export async function getPhoto(photoId) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('photos', 'readonly');
        const store = transaction.objectStore('photos');
        const request = store.get(photoId);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Update photo status and metadata
 */
export async function updatePhotoStatus(photoId, status, metadata = {}) {
    await initDB();

    const photo = await getPhoto(photoId);
    if (!photo) throw new Error('Photo not found');

    const updatedPhoto = {
        ...photo,
        status,
        ...metadata,
        updatedAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('photos', 'readwrite');
        const store = transaction.objectStore('photos');
        const request = store.put(updatedPhoto);

        request.onsuccess = () => resolve(updatedPhoto);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete photo blob but keep metadata (after successful upload)
 */
export async function deletePhotoBlob(photoId) {
    await initDB();

    const photo = await getPhoto(photoId);
    if (!photo) return;

    // Remove blob but keep metadata
    const updatedPhoto = {
        ...photo,
        blob: null, // Remove the blob to free space
        blobDeleted: true,
        blobDeletedAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('photos', 'readwrite');
        const store = transaction.objectStore('photos');
        const request = store.put(updatedPhoto);

        request.onsuccess = () => resolve(updatedPhoto);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get photos by audit with status filter
 */
export async function getPhotosByAudit(auditId, statusFilter = null) {
    const photos = await getAuditPhotos(auditId);
    if (statusFilter) {
        return photos.filter(p => p.status === statusFilter);
    }
    return photos;
}

/**
 * Get photos for an audit
 */
export async function getAuditPhotos(auditId) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('photos', 'readonly');
        const store = transaction.objectStore('photos');
        const index = store.index('auditId');
        const request = index.getAll(auditId);

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get photos for a specific item
 */
export async function getItemPhotos(itemId) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('photos', 'readonly');
        const store = transaction.objectStore('photos');
        const index = store.index('itemId');
        const request = index.getAll(itemId);

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a photo
 */
export async function deletePhoto(photoId) {
    await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction('photos', 'readwrite');
        const store = transaction.objectStore('photos');
        const request = store.delete(photoId);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete all photos for an audit
 */
async function deleteAuditPhotos(auditId) {
    const photos = await getAuditPhotos(auditId);
    for (const photo of photos) {
        await deletePhoto(photo.id);
    }
}

/**
 * Convert blob to base64 (for API upload)
 */
export function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
