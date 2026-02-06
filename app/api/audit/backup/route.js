/**
 * Audit Backup API
 * 
 * Saves audit data as JSON to Drive folder for recovery if submit fails.
 * Called periodically during audit to prevent data loss.
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

export async function POST(request) {
    try {
        // Get access token from header
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
        const accessToken = authHeader.split(' ')[1];

        // Parse request body
        const {
            auditId,
            auditFolderId,
            backupFileId, // Existing backup file to update (if any)
            auditData
        } = await request.json();

        if (!auditId || !auditFolderId || !auditData) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Create Google Drive client
        const auth = getGoogleClient(accessToken);
        const drive = google.drive({ version: 'v3', auth });

        // Prepare backup content
        const backupContent = JSON.stringify({
            auditId,
            timestamp: new Date().toISOString(),
            version: 1,
            data: auditData,
        }, null, 2);

        const buffer = Buffer.from(backupContent, 'utf-8');

        let fileId;

        if (backupFileId) {
            // Update existing backup file
            try {
                await drive.files.update({
                    fileId: backupFileId,
                    media: {
                        mimeType: 'application/json',
                        body: require('stream').Readable.from(buffer),
                    },
                });
                fileId = backupFileId;
                console.log(`[BACKUP] Updated backup file: ${backupFileId}`);
            } catch (updateErr) {
                // If update fails, create new file
                console.warn(`[BACKUP] Could not update existing backup, creating new:`, updateErr.message);
                fileId = null;
            }
        }

        if (!fileId) {
            // Create new backup file
            const file = await drive.files.create({
                resource: {
                    name: `_audit_backup_${auditId}.json`,
                    mimeType: 'application/json',
                    parents: [auditFolderId],
                },
                media: {
                    mimeType: 'application/json',
                    body: require('stream').Readable.from(buffer),
                },
                fields: 'id, name',
            });
            fileId = file.data.id;
            console.log(`[BACKUP] Created new backup file: ${fileId}`);
        }

        return NextResponse.json({
            success: true,
            backupFileId: fileId,
            timestamp: new Date().toISOString(),
        });

    } catch (err) {
        console.error('[BACKUP] Error:', err);
        return NextResponse.json({
            error: 'Failed to save backup',
            message: err.message,
        }, { status: 500 });
    }
}

/**
 * GET - Retrieve backup data for recovery
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const backupFileId = searchParams.get('backupFileId');

        if (!backupFileId) {
            return NextResponse.json({ error: 'Missing backupFileId' }, { status: 400 });
        }

        // Get access token from header
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
        const accessToken = authHeader.split(' ')[1];

        // Create Google Drive client
        const auth = getGoogleClient(accessToken);
        const drive = google.drive({ version: 'v3', auth });

        // Download backup file content
        const response = await drive.files.get({
            fileId: backupFileId,
            alt: 'media',
        });

        const backupData = response.data;
        console.log(`[BACKUP] Retrieved backup: ${backupFileId}`);

        return NextResponse.json({
            success: true,
            backup: backupData,
        });

    } catch (err) {
        console.error('[BACKUP] Retrieve error:', err);
        return NextResponse.json({
            error: 'Failed to retrieve backup',
            message: err.message,
        }, { status: 500 });
    }
}
