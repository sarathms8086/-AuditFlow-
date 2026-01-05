/**
 * Google Drive API utilities
 */

import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth';

/**
 * Find a folder by name within a parent folder
 */
async function findFolder(drive, name, parentId = null) {
    let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
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
 * Create a folder
 */
async function createFolder(drive, name, parentId = null) {
    const fileMetadata = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentId) {
        fileMetadata.parents = [parentId];
    }

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
 * Create the audit folder structure
 */
export async function createAuditFolderStructure(accessToken, { clientName, siteName, auditDate }) {
    const auth = getAuthenticatedClient(accessToken);
    const drive = google.drive({ version: 'v3', auth });

    const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || null;

    // Create/find client folder
    const clientFolder = await findOrCreateFolder(drive, clientName, parentFolderId);

    // Create audit folder with date
    const dateStr = new Date(auditDate).toISOString().split('T')[0];
    const auditFolderName = `${siteName}_${dateStr}`;
    const auditFolder = await createFolder(drive, auditFolderName, clientFolder.id);

    // Create photos subfolder
    const photosFolder = await createFolder(drive, 'Photos', auditFolder.id);

    return {
        clientFolderId: clientFolder.id,
        auditFolderId: auditFolder.id,
        auditFolderLink: `https://drive.google.com/drive/folders/${auditFolder.id}`,
        photosFolderId: photosFolder.id,
    };
}

/**
 * Create section photo folders
 */
export async function createSectionPhotoFolders(accessToken, photosFolderId, sectionTitles) {
    const auth = getAuthenticatedClient(accessToken);
    const drive = google.drive({ version: 'v3', auth });

    const sectionFolders = {};
    for (const title of sectionTitles) {
        if (title) {
            const folder = await createFolder(drive, title, photosFolderId);
            sectionFolders[title] = folder.id;
        }
    }

    return sectionFolders;
}

/**
 * Upload a photo to Drive
 */
export async function uploadPhoto(accessToken, folderId, filename, buffer, mimeType) {
    const auth = getAuthenticatedClient(accessToken);
    const drive = google.drive({ version: 'v3', auth });

    const { Readable } = await import('stream');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const response = await drive.files.create({
        requestBody: {
            name: filename,
            parents: [folderId],
        },
        media: {
            mimeType,
            body: stream,
        },
        fields: 'id, name, webViewLink, webContentLink',
    });

    // Make file viewable by anyone with link
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
 * Move a file to a folder
 */
export async function moveFileToFolder(accessToken, fileId, folderId) {
    const auth = getAuthenticatedClient(accessToken);
    const drive = google.drive({ version: 'v3', auth });

    const file = await drive.files.get({
        fileId,
        fields: 'parents',
    });

    const previousParents = file.data.parents?.join(',') || '';

    await drive.files.update({
        fileId,
        addParents: folderId,
        removeParents: previousParents,
        fields: 'id, parents',
    });
}
