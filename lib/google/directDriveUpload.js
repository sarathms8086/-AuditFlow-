/**
 * Direct Google Drive Upload
 * 
 * Uploads files directly from the browser to Google Drive,
 * bypassing Vercel's 4.5MB serverless function limit.
 * 
 * Uses Google Drive API v3 multipart upload.
 */

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * Upload a blob directly to Google Drive
 * 
 * @param {Blob} blob - The file blob to upload
 * @param {string} filename - Name for the file in Drive
 * @param {string} folderId - Google Drive folder ID to upload to
 * @param {string} accessToken - Valid Google OAuth access token
 * @returns {Promise<{fileId: string, webViewLink: string}>}
 */
export async function uploadBlobToDrive(blob, filename, folderId, accessToken) {
    console.log(`[DIRECT UPLOAD] Starting direct upload: ${filename}`);
    console.log(`[DIRECT UPLOAD] Blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`[DIRECT UPLOAD] Target folder: ${folderId}`);

    // Create metadata for the file
    const metadata = {
        name: filename,
        mimeType: blob.type || 'image/jpeg',
        parents: folderId ? [folderId] : undefined,
    };

    // Create FormData for multipart upload
    // This is cleaner than manual boundary construction
    const formData = new FormData();

    // Add metadata as a blob with JSON content type
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

    // Add the actual file
    formData.append('file', blob, filename);

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
        console.log('[DIRECT UPLOAD] Sending to Google Drive API...');

        const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,webViewLink,name`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
            body: formData,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log(`[DIRECT UPLOAD] Response status: ${response.status}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[DIRECT UPLOAD] Error response:', errorData);

            // Check for specific error types
            if (response.status === 401) {
                throw new Error('Token expired or invalid');
            } else if (response.status === 403) {
                throw new Error('Access denied to Google Drive');
            } else if (response.status === 404) {
                throw new Error('Target folder not found');
            } else {
                throw new Error(errorData.error?.message || `Upload failed with status ${response.status}`);
            }
        }

        const result = await response.json();
        console.log(`[DIRECT UPLOAD] Upload success! File ID: ${result.id}`);

        // Make file publicly viewable so Google Slides can embed it
        await makeFilePublic(result.id, accessToken);

        return {
            fileId: result.id,
            webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
            name: result.name,
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('[DIRECT UPLOAD] Upload timed out after 60s');
            throw new Error('Upload timed out - network too slow');
        }
        console.error('[DIRECT UPLOAD] Failed:', error.message);
        throw error;
    }
}

/**
 * Make a file publicly viewable (required for Google Slides to embed images)
 * 
 * @param {string} fileId - Google Drive file ID
 * @param {string} accessToken - Valid Google OAuth access token
 */
async function makeFilePublic(fileId, accessToken) {
    console.log(`[DIRECT UPLOAD] Making file public: ${fileId}`);

    try {
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    role: 'reader',
                    type: 'anyone',
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.warn('[DIRECT UPLOAD] Failed to make file public:', errorData);
            // Don't throw - upload succeeded, just permission setting failed
            // The file will still be accessible to the owner
        } else {
            console.log('[DIRECT UPLOAD] File is now publicly viewable');
        }
    } catch (error) {
        console.warn('[DIRECT UPLOAD] Error making file public:', error.message);
        // Don't throw - this is a non-critical operation
    }
}

/**
 * Upload with automatic retry on token expiration
 * 
 * @param {Blob} blob - The file blob to upload
 * @param {string} filename - Name for the file in Drive
 * @param {string} folderId - Google Drive folder ID
 * @param {Function} getAccessToken - Function that returns a valid access token
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<{fileId: string, webViewLink: string}>}
 */
export async function uploadWithRetry(blob, filename, folderId, getAccessToken, maxRetries = 2) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Get a fresh token for each attempt
            const accessToken = await getAccessToken();

            if (!accessToken) {
                throw new Error('No access token available');
            }

            return await uploadBlobToDrive(blob, filename, folderId, accessToken);
        } catch (error) {
            lastError = error;
            console.warn(`[DIRECT UPLOAD] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

            // Only retry on token-related errors
            if (error.message.includes('Token expired') || error.message.includes('invalid')) {
                console.log('[DIRECT UPLOAD] Token issue detected, will retry with fresh token...');
                continue;
            }

            // For other errors, don't retry
            throw error;
        }
    }

    throw lastError;
}
