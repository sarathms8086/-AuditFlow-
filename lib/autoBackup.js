/**
 * Auto-Backup Service
 * 
 * Automatically backs up audit data to Google Drive every 2 minutes.
 * Prevents data loss if submit fails or phone dies.
 */

import { getValidAccessToken } from './tokenManager';

// Backup state
let backupTimer = null;
let lastBackupTime = null;
let isBackingUp = false;

const BACKUP_INTERVAL = 2 * 60 * 1000; // 2 minutes

/**
 * Save backup to Drive
 */
async function saveBackup(auditId, auditFolderId, backupFileId, auditData) {
    if (isBackingUp) {
        console.log('[BACKUP] Already backing up, skipping...');
        return null;
    }

    if (!navigator.onLine) {
        console.log('[BACKUP] Offline, will backup when online');
        return null;
    }

    isBackingUp = true;

    try {
        const accessToken = await getValidAccessToken();

        const response = await fetch('/api/audit/backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                auditId,
                auditFolderId,
                backupFileId,
                auditData,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Backup failed');
        }

        const result = await response.json();
        lastBackupTime = new Date();
        console.log(`[BACKUP] Saved successfully at ${lastBackupTime.toLocaleTimeString()}`);

        return result.backupFileId;
    } catch (err) {
        console.error('[BACKUP] Error:', err.message);
        return null;
    } finally {
        isBackingUp = false;
    }
}

/**
 * Start auto-backup for an audit
 * @param {Object} audit - Audit object from IndexedDB
 * @param {Function} getLatestData - Function to get latest audit data
 * @returns {Function} - Stop function to cancel auto-backup
 */
export function startAutoBackup(audit, getLatestData) {
    if (!audit?.driveResources?.auditFolderId) {
        console.log('[BACKUP] No Drive folder - auto-backup disabled');
        return () => { };
    }

    const auditId = audit.id;
    const auditFolderId = audit.driveResources.auditFolderId;
    let backupFileId = audit.driveResources.backupFileId || null;

    console.log(`[BACKUP] Starting auto-backup for audit ${auditId}`);

    // Do initial backup after 30 seconds
    const initialTimer = setTimeout(async () => {
        const latestData = getLatestData();
        const newBackupId = await saveBackup(auditId, auditFolderId, backupFileId, latestData);
        if (newBackupId) {
            backupFileId = newBackupId;
        }
    }, 30 * 1000);

    // Then backup every 2 minutes
    backupTimer = setInterval(async () => {
        const latestData = getLatestData();
        const newBackupId = await saveBackup(auditId, auditFolderId, backupFileId, latestData);
        if (newBackupId) {
            backupFileId = newBackupId;
        }
    }, BACKUP_INTERVAL);

    // Return stop function
    return () => {
        clearTimeout(initialTimer);
        if (backupTimer) {
            clearInterval(backupTimer);
            backupTimer = null;
        }
        console.log('[BACKUP] Auto-backup stopped');
    };
}

/**
 * Trigger an immediate backup (e.g., on important changes)
 */
export async function triggerBackup(audit, auditData) {
    if (!audit?.driveResources?.auditFolderId) {
        return null;
    }

    const auditId = audit.id;
    const auditFolderId = audit.driveResources.auditFolderId;
    const backupFileId = audit.driveResources.backupFileId || null;

    return await saveBackup(auditId, auditFolderId, backupFileId, auditData);
}

/**
 * Get last backup time
 */
export function getLastBackupTime() {
    return lastBackupTime;
}

/**
 * Check if backup is in progress
 */
export function isBackupInProgress() {
    return isBackingUp;
}

/**
 * Recover audit data from backup file in Drive
 * @param {string} backupFileId - The backup file ID in Drive
 * @returns {Object} - The recovered audit data
 */
export async function recoverFromBackup(backupFileId) {
    if (!backupFileId) {
        throw new Error('No backup file ID provided');
    }

    try {
        const accessToken = await getValidAccessToken();

        const response = await fetch(`/api/audit/backup?backupFileId=${backupFileId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Failed to retrieve backup');
        }

        const result = await response.json();
        console.log(`[RECOVER] Retrieved backup from ${backupFileId}`);

        return result.backup;
    } catch (err) {
        console.error('[RECOVER] Error:', err.message);
        throw err;
    }
}

/**
 * Find backup file in Drive folder
 * Searches for _audit_backup_*.json in the audit folder
 */
export async function findBackupInFolder(auditFolderId) {
    if (!auditFolderId) {
        return null;
    }

    try {
        const accessToken = await getValidAccessToken();

        // Search for backup file in the folder
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${auditFolderId}' in parents and name contains '_audit_backup_' and trashed=false&fields=files(id,name,modifiedTime)`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error('Failed to search for backup');
        }

        const data = await response.json();
        const files = data.files || [];

        if (files.length === 0) {
            console.log('[RECOVER] No backup file found');
            return null;
        }

        // Return the most recent backup
        const mostRecent = files.sort((a, b) =>
            new Date(b.modifiedTime) - new Date(a.modifiedTime)
        )[0];

        console.log(`[RECOVER] Found backup: ${mostRecent.name}`);
        return mostRecent;
    } catch (err) {
        console.error('[RECOVER] Search error:', err.message);
        return null;
    }
}
