/**
 * Upload Progress Badge Component
 * 
 * Shows upload status with:
 * - Combined status (uploading + failed counts)
 * - Auto-retry functionality
 * - Retry button for failed uploads
 */

'use client';

import { useEffect, useState } from 'react';
import { addUploadListener, getUploadStatus, retryFailedUploads } from '@/lib/backgroundUpload';
import styles from './UploadBadge.module.css';

export function UploadBadge({ auditId }) {
    const [status, setStatus] = useState({
        total: 0,
        pending: 0,
        uploaded: 0,
        failed: 0,
        isUploading: false,
    });
    const [retrying, setRetrying] = useState(false);

    useEffect(() => {
        // Get initial status
        if (auditId) {
            getUploadStatus(auditId).then(setStatus);
        }

        // Listen for updates
        const unsubscribe = addUploadListener((event) => {
            if (auditId) {
                getUploadStatus(auditId).then(setStatus);
            }
        });

        return unsubscribe;
    }, [auditId]);

    // Handle retry click
    const handleRetry = async () => {
        if (retrying || !auditId) return;

        setRetrying(true);
        try {
            await retryFailedUploads(auditId);
        } catch (err) {
            console.error('Retry failed:', err);
        } finally {
            // Keep retrying state briefly so user sees feedback
            setTimeout(() => setRetrying(false), 1000);
        }
    };

    // Don't show if no photos
    if (status.total === 0) return null;

    // Calculate active uploads (pending + uploading states)
    const activeUploads = status.pending;
    const hasActive = status.isUploading || activeUploads > 0;
    const hasFailed = status.failed > 0;

    // All uploaded successfully
    if (status.allUploaded && status.uploaded > 0) {
        return (
            <div className={`${styles.badge} ${styles.success}`}>
                <span className={styles.icon}>✅</span>
                <span className={styles.text}>{status.uploaded} synced</span>
            </div>
        );
    }

    // Has both active AND failed - show combined status
    if (hasActive && hasFailed) {
        return (
            <div className={styles.badgeGroup}>
                <div className={`${styles.badge} ${styles.uploading}`}>
                    <span className={styles.spinner}></span>
                    <span className={styles.text}>
                        {status.uploaded}/{status.total - status.failed}
                    </span>
                </div>
                <button
                    className={`${styles.badge} ${styles.error} ${styles.retryBtn}`}
                    onClick={handleRetry}
                    disabled={retrying}
                >
                    <span className={styles.icon}>{retrying ? '🔄' : '⚠️'}</span>
                    <span className={styles.text}>
                        {retrying ? 'Retrying...' : `${status.failed} failed`}
                    </span>
                </button>
            </div>
        );
    }

    // Only failed (no active uploads)
    if (hasFailed) {
        return (
            <button
                className={`${styles.badge} ${styles.error} ${styles.retryBtn}`}
                onClick={handleRetry}
                disabled={retrying}
            >
                <span className={styles.icon}>{retrying ? '🔄' : '⚠️'}</span>
                <span className={styles.text}>
                    {retrying ? 'Retrying...' : `${status.failed} failed · Tap to retry`}
                </span>
            </button>
        );
    }

    // Only active uploads (no failures)
    if (hasActive) {
        return (
            <div className={`${styles.badge} ${styles.uploading}`}>
                <span className={styles.spinner}></span>
                <span className={styles.text}>
                    {status.uploaded}/{status.total} uploading...
                </span>
            </div>
        );
    }

    return null;
}
