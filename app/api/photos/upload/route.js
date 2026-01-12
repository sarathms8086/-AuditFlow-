/**
 * Photo Upload API
 * 
 * Uploads a single photo directly to Google Drive.
 * Used for background uploading as user captures photos.
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';

/**
 * Create authenticated Google client
 */
function getGoogleClient(accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return auth;
}

/**
 * Get or create AuditFlow folder in Google Drive
 */
async function getOrCreateAuditFlowFolder(drive) {
    // Check if AuditFlow folder exists
    const response = await drive.files.list({
        q: "name='AuditFlow' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name)',
    });

    if (response.data.files.length > 0) {
        return response.data.files[0].id;
    }

    // Create AuditFlow folder
    const folder = await drive.files.create({
        resource: {
            name: 'AuditFlow',
            mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
    });

    return folder.data.id;
}

/**
 * Get or create Photos folder for the audit
 */
async function getOrCreatePhotosFolder(drive, parentFolderId, auditId) {
    const folderName = `Photos_${auditId}`;

    // Check if folder exists
    const response = await drive.files.list({
        q: `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
    });

    if (response.data.files.length > 0) {
        return response.data.files[0].id;
    }

    // Create folder
    const folder = await drive.files.create({
        resource: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        },
        fields: 'id',
    });

    return folder.data.id;
}

/**
 * POST /api/photos/upload
 * 
 * Upload a single photo to Google Drive
 */
export async function POST(request) {
    try {
        // Get access token from header
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
        const accessToken = authHeader.split(' ')[1];

        // Parse request body
        const { auditId, itemId, filename, base64, mimeType } = await request.json();

        if (!auditId || !filename || !base64) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Create Google Drive client
        const auth = getGoogleClient(accessToken);
        const drive = google.drive({ version: 'v3', auth });

        // Get or create folders
        const auditFlowFolderId = await getOrCreateAuditFlowFolder(drive);
        const photosFolderId = await getOrCreatePhotosFolder(drive, auditFlowFolderId, auditId);

        // Convert base64 to buffer
        const buffer = Buffer.from(base64, 'base64');

        // Upload to Drive
        const file = await drive.files.create({
            resource: {
                name: filename,
                parents: [photosFolderId],
            },
            media: {
                mimeType: mimeType || 'image/jpeg',
                body: require('stream').Readable.from(buffer),
            },
            fields: 'id, name, webViewLink, webContentLink',
        });

        // Set public permission so Google Slides can access the image
        await drive.permissions.create({
            fileId: file.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        console.log(`[PHOTO] Uploaded ${filename} to Drive: ${file.data.id} (public)`);

        return NextResponse.json({
            success: true,
            fileId: file.data.id,
            filename: file.data.name,
            webViewLink: file.data.webViewLink,
            webContentLink: file.data.webContentLink,
        });

    } catch (err) {
        console.error('[PHOTO] Upload error:', err);

        // Check for specific error types
        if (err.message?.includes('invalid_grant') || err.message?.includes('Invalid Credentials')) {
            return NextResponse.json({ error: 'Invalid Credentials - please re-login' }, { status: 401 });
        }

        return NextResponse.json({
            error: 'Failed to upload photo',
            message: err.message,
        }, { status: 500 });
    }
}
