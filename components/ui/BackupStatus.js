/**
 * Backup Status Indicator
 * 
 * Shows backup status in audit header:
 * - Last backup time
 * - Backup in progress
 * - Offline state
 */

'use client';

import { useState, useEffect } from 'react';
import { getLastBackupTime, isBackupInProgress } from '@/lib/autoBackup';
import { useOffline } from '@/hooks/useOffline';
import styles from './BackupStatus.module.css';

export function BackupStatus({ lastBackupInfo }) {
    const { online } = useOffline();
    const [lastTime, setLastTime] = useState(null);
    const [backing, setBacking] = useState(false);

    useEffect(() => {
        // Update from props if provided
        if (lastBackupInfo?.timestamp) {
            setLastTime(lastBackupInfo.timestamp);
        }

        // Poll for updates
        const interval = setInterval(() => {
            const time = getLastBackupTime();
            if (time) setLastTime(time);
            setBacking(isBackupInProgress());
        }, 5000);

        return () => clearInterval(interval);
    }, [lastBackupInfo]);

    // Format relative time
    const formatTime = (date) => {
        if (!date) return null;
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);

        if (diff < 60) return 'just now';
        if (diff < 120) return '1 min ago';
        if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Offline state
    if (!online) {
        return (
            <div className={`${styles.status} ${styles.offline}`}>
                <span className={styles.icon}>📵</span>
                <span className={styles.text}>Offline</span>
            </div>
        );
    }

    // Backing up
    if (backing) {
        return (
            <div className={`${styles.status} ${styles.syncing}`}>
                <span className={styles.spinner}></span>
                <span className={styles.text}>Backing up...</span>
            </div>
        );
    }

    // Show last backup time
    if (lastTime) {
        return (
            <div className={`${styles.status} ${styles.synced}`}>
                <span className={styles.icon}>☁️</span>
                <span className={styles.text}>{formatTime(lastTime)}</span>
            </div>
        );
    }

    // No backup yet
    return (
        <div className={`${styles.status} ${styles.pending}`}>
            <span className={styles.icon}>⏳</span>
            <span className={styles.text}>Pending backup</span>
        </div>
    );
}
