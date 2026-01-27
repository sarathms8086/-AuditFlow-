/**
 * Recovery Banner Component
 * 
 * Shows when a backup is detected that's newer than local data.
 * Offers to recover data from Google Drive backup.
 */

'use client';

import { useState, useEffect } from 'react';
import { findBackupInFolder, recoverFromBackup } from '@/lib/autoBackup';
import styles from './RecoveryBanner.module.css';

export function RecoveryBanner({ audit, onRecover }) {
    const [backupInfo, setBackupInfo] = useState(null);
    const [recovering, setRecovering] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!audit?.driveResources?.auditFolderId) return;

        // Check for backup in Drive
        const checkBackup = async () => {
            try {
                const backup = await findBackupInFolder(audit.driveResources.auditFolderId);

                if (backup) {
                    // Compare backup time with local updatedAt
                    const backupTime = new Date(backup.modifiedTime);
                    const localTime = new Date(audit.updatedAt);

                    // Only show if backup is significantly newer (> 30 seconds)
                    if (backupTime > localTime && (backupTime - localTime) > 30000) {
                        setBackupInfo({
                            ...backup,
                            backupTime,
                            localTime,
                        });
                    }
                }
            } catch (err) {
                console.error('[RECOVERY] Check failed:', err);
            }
        };

        checkBackup();
    }, [audit?.id]);

    const handleRecover = async () => {
        if (!backupInfo?.id) return;

        setRecovering(true);
        setError(null);

        try {
            const data = await recoverFromBackup(backupInfo.id);

            if (data && onRecover) {
                await onRecover(data);
                setDismissed(true);
            }
        } catch (err) {
            console.error('[RECOVERY] Failed:', err);
            setError(err.message);
        } finally {
            setRecovering(false);
        }
    };

    const handleDismiss = () => {
        setDismissed(true);
    };

    // Don't show if no backup or dismissed
    if (!backupInfo || dismissed) return null;

    const formatTime = (date) => {
        return date.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className={styles.banner}>
            <div className={styles.content}>
                <div className={styles.icon}>💾</div>
                <div className={styles.message}>
                    <strong>Backup Found</strong>
                    <span>
                        A newer backup from {formatTime(backupInfo.backupTime)} was found.
                        Your local data is from {formatTime(backupInfo.localTime)}.
                    </span>
                    {error && <span className={styles.error}>{error}</span>}
                </div>
            </div>
            <div className={styles.actions}>
                <button
                    className={styles.dismissBtn}
                    onClick={handleDismiss}
                    disabled={recovering}
                >
                    Keep Local
                </button>
                <button
                    className={styles.recoverBtn}
                    onClick={handleRecover}
                    disabled={recovering}
                >
                    {recovering ? 'Recovering...' : 'Restore Backup'}
                </button>
            </div>
        </div>
    );
}
