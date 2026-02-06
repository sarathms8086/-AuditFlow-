/**
 * Google Drive Service
 * 
 * Handles folder creation and file uploads to Google Drive.
 * Creates the audit folder structure:
 * 
 * 📁 Client_Name
 *  └── 📁 Site_Name_AuditDate
 *       ├── 📄 Electrical_Audit_Checklist (Google Sheet)
 *       ├── 📊 Electrical_Audit_Report (Google PPT)
 *       └── 📁 Photos
 *            ├── Section_1
 *            └── Section_2
 */

import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';

/**
 * Get Drive API client
 */
function getDriveClient(accessToken) {
    const auth = getAuthenticatedClient(accessToken);
    return google.drive({ version: 'v3', auth });
}

/**
 * Find a folder by name within a parent folder
 */
async function findFolder(drive, name, parentId = null) {
    let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const response = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    return response.data.files[0] || null;
}

/**
 * Create a folder in Google Drive
 */
async function createFolder(drive, name, parentId = null) {
    const fileMetadata = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId && { parents: [parentId] }),
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        fields: 'id, name, webViewLink',
    });

    return response.data;
}

/**
 * Find or create a folder
 */
async function findOrCreateFolder(drive, name, parentId = null) {
    const existing = await findFolder(drive, name, parentId);
    if (existing) {
        return existing;
    }
    return createFolder(drive, name, parentId);
}

/**
 * Create the complete audit folder structure
 * 
 * @param {string} accessToken - Google OAuth access token
 * @param {object} auditInfo - Audit metadata
 * @returns {object} - Folder IDs for all created folders
 */
export async function createAuditFolderStructure(accessToken, auditInfo) {
    const drive = getDriveClient(accessToken);
    const { clientName, siteName, auditDate } = auditInfo;

    // Format date for folder name (YYYY-MM-DD)
    const dateStr = new Date(auditDate).toISOString().split('T')[0];

    // Parent folder ID (optional - from env or root)
    const rootParentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || null;

    // 1. Create/find client folder
    const clientFolder = await findOrCreateFolder(drive, clientName, rootParentId);

    // 2. Create audit folder: Site_Name_AuditDate
    const auditFolderName = `${siteName}_${dateStr}`;
    const auditFolder = await createFolder(drive, auditFolderName, clientFolder.id);

    // 3. Create Photos folder inside audit folder
    const photosFolder = await createFolder(drive, 'Photos', auditFolder.id);

    return {
        clientFolderId: clientFolder.id,
        auditFolderId: auditFolder.id,
        photosFolderId: photosFolder.id,
        auditFolderLink: auditFolder.webViewLink,
    };
}

/**
 * Create section subfolders inside Photos folder
 */
export async function createSectionPhotoFolders(accessToken, photosFolderId, sectionTitles) {
    const drive = getDriveClient(accessToken);
    const sectionFolders = {};

    for (const title of sectionTitles) {
        const folder = await createFolder(drive, title, photosFolderId);
        sectionFolders[title] = folder.id;
    }

    return sectionFolders;
}

/**
 * Upload a photo to Google Drive
 * 
 * @param {string} accessToken - Google OAuth access token
 * @param {string} folderId - Parent folder ID
 * @param {string} filename - Photo filename
 * @param {Buffer} buffer - Photo file buffer
 * @param {string} mimeType - Photo MIME type
 * @returns {object} - Uploaded file info with webViewLink
 */
export async function uploadPhoto(accessToken, folderId, filename, buffer, mimeType) {
    const drive = getDriveClient(accessToken);

    const fileMetadata = {
        name: filename,
        parents: [folderId],
    };

    const media = {
        mimeType,
        body: bufferToStream(buffer),
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        media,
        fields: 'id, name, webViewLink, webContentLink',
    });

    // Make the file viewable with link
    await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    return response.data;
}

/**
 * Move a file (Sheet/Slides) to a specific folder
 */
export async function moveFileToFolder(accessToken, fileId, folderId) {
    const drive = getDriveClient(accessToken);

    // Get current parents
    const file = await drive.files.get({
        fileId,
        fields: 'parents',
    });

    const previousParents = file.data.parents?.join(',') || '';

    // Move file
    await drive.files.update({
        fileId,
        addParents: folderId,
        removeParents: previousParents,
        fields: 'id, parents',
    });
}

/**
 * Helper: Convert buffer to readable stream
 */
function bufferToStream(buffer) {
    const { Readable } = require('stream');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
}
