/**
 * Upload Progress Badge Component
 * 
 * Shows a small badge with current upload status
 */

'use client';

import { useEffect, useState } from 'react';
import { addUploadListener, getUploadStatus } from '@/lib/backgroundUpload';
import styles from './UploadBadge.module.css';

export function UploadBadge({ auditId }) {
    const [status, setStatus] = useState({
        total: 0,
        pending: 0,
        uploaded: 0,
        failed: 0,
        isUploading: false,
    });

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

    // Don't show if no photos
    if (status.total === 0) return null;

    // All uploaded
    if (status.allUploaded) {
        return (
            <div className={`${styles.badge} ${styles.success}`}>
                <span className={styles.icon}>✅</span>
                <span className={styles.text}>{status.uploaded} photos uploaded</span>
            </div>
        );
    }

    // Has failed
    if (status.failed > 0) {
        return (
            <div className={`${styles.badge} ${styles.error}`}>
                <span className={styles.icon}>⚠️</span>
                <span className={styles.text}>{status.failed} failed</span>
            </div>
        );
    }

    // Uploading
    if (status.isUploading || status.pending > 0) {
        return (
            <div className={`${styles.badge} ${styles.uploading}`}>
                <span className={styles.spinner}></span>
                <span className={styles.text}>
                    Uploading {status.uploaded}/{status.total}...
                </span>
            </div>
        );
    }

    return null;
}
