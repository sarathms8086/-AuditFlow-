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
 * Optionally adds slide to PPT if presentationId is provided
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
        const {
            auditId,
            itemId,
            filename,
            base64,
            mimeType,
            targetFolderId,     // Optional: specific folder to upload to
            presentationId,     // Optional: PPT to add slide to
            sectionTitle,       // Optional: section name for slide
        } = await request.json();

        if (!auditId || !filename || !base64) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Create Google Drive client
        const auth = getGoogleClient(accessToken);
        const drive = google.drive({ version: 'v3', auth });

        // Determine target folder
        let photosFolderId;
        if (targetFolderId) {
            // Use provided folder (real-time sync mode)
            photosFolderId = targetFolderId;
            console.log(`[PHOTO] Using target folder: ${targetFolderId}`);
        } else {
            // Fallback: create temp folder structure
            const auditFlowFolderId = await getOrCreateAuditFlowFolder(drive);
            photosFolderId = await getOrCreatePhotosFolder(drive, auditFlowFolderId, auditId);
        }

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

        // If presentationId provided, add slide to PPT immediately
        let slideAdded = false;
        if (presentationId) {
            try {
                const slides = google.slides({ version: 'v1', auth });

                // Create a new slide with the photo
                const slideId = `slide_${Date.now()}`;
                const imageUrl = `https://drive.google.com/uc?export=view&id=${file.data.id}`;

                await slides.presentations.batchUpdate({
                    presentationId,
                    resource: {
                        requests: [
                            {
                                createSlide: {
                                    objectId: slideId,
                                    slideLayoutReference: { predefinedLayout: 'BLANK' },
                                },
                            },
                            {
                                createImage: {
                                    objectId: `${slideId}_img`,
                                    url: imageUrl,
                                    elementProperties: {
                                        pageObjectId: slideId,
                                        size: { width: { magnitude: 500, unit: 'PT' }, height: { magnitude: 350, unit: 'PT' } },
                                        transform: { scaleX: 1, scaleY: 1, translateX: 110, translateY: 80, unit: 'PT' },
                                    },
                                },
                            },
                            // Add section title if provided
                            ...(sectionTitle ? [{
                                createShape: {
                                    objectId: `${slideId}_title`,
                                    shapeType: 'TEXT_BOX',
                                    elementProperties: {
                                        pageObjectId: slideId,
                                        size: { width: { magnitude: 600, unit: 'PT' }, height: { magnitude: 40, unit: 'PT' } },
                                        transform: { scaleX: 1, scaleY: 1, translateX: 60, translateY: 20, unit: 'PT' },
                                    },
                                },
                            },
                            {
                                insertText: {
                                    objectId: `${slideId}_title`,
                                    text: sectionTitle,
                                },
                            }] : []),
                        ],
                    },
                });

                slideAdded = true;
                console.log(`[PHOTO] Added slide to PPT: ${presentationId}`);
            } catch (slideErr) {
                console.error('[PHOTO] Failed to add slide:', slideErr.message);
                // Don't fail the whole upload if slide fails
            }
        }

        return NextResponse.json({
            success: true,
            fileId: file.data.id,
            filename: file.data.name,
            webViewLink: file.data.webViewLink,
            webContentLink: file.data.webContentLink,
            slideAdded,
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
