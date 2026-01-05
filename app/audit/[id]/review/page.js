/**
 * Audit Review Page
 * 
 * Review audit before submission with validation
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useOffline } from '@/hooks/useOffline';
import { getAudit, updateAudit, getAuditPhotos } from '@/lib/db';
import { syncPendingAudits } from '@/lib/sync';
import styles from './page.module.css';

export default function AuditReviewPage() {
    const router = useRouter();
    const params = useParams();
    const { online, syncing } = useOffline();

    const [audit, setAudit] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [validationErrors, setValidationErrors] = useState([]);
    const [submitResult, setSubmitResult] = useState(null);

    useEffect(() => {
        loadAudit();
    }, [params.id]);

    const loadAudit = async () => {
        try {
            const auditData = await getAudit(params.id);
            if (!auditData) {
                alert('Audit not found');
                router.push('/');
                return;
            }
            setAudit(auditData);

            const photoData = await getAuditPhotos(params.id);
            setPhotos(photoData);

            // Validate
            validateAudit(auditData, photoData);
        } catch (err) {
            console.error('Failed to load audit:', err);
        } finally {
            setLoading(false);
        }
    };

    const validateAudit = (auditData, photoData) => {
        const errors = [];

        for (const section of auditData.checklist?.sections || []) {
            // Get all items - support both old (items) and new (subsections) structure
            const allItems = [];
            if (section.subsections && section.subsections.length > 0) {
                for (const sub of section.subsections) {
                    allItems.push(...(sub.items || []));
                }
            } else {
                allItems.push(...(section.items || []));
            }

            for (const item of allItems) {
                const itemId = item.sl_no || item.slNo || item.item_id;
                const response = auditData.responses[itemId];
                const checkingCriteria = item.checking_criteria || item.checkingCriteria;
                const remarksRequiredIf = item.remarks_required_if || item.remarksRequiredIf;
                const photoRequired = item.photo_required || item.photoRequired;

                // Check if answered
                if (!response?.response) {
                    errors.push({ itemId, message: `${itemId}: Not answered`, type: 'missing' });
                    continue;
                }

                // Check remarks
                if (response.response === remarksRequiredIf && !response.remarks?.trim()) {
                    errors.push({ itemId, message: `${itemId}: Remarks required when "${remarksRequiredIf}"`, type: 'remarks' });
                }

                // Check photo
                if (photoRequired && !photoData.some(p => p.itemId === itemId)) {
                    errors.push({ itemId, message: `${itemId}: Photo required`, type: 'photo' });
                }
            }
        }

        setValidationErrors(errors);
        return errors.length === 0;
    };

    const handleSubmit = async () => {
        if (!validateAudit(audit, photos)) {
            alert('Please fix validation errors before submitting');
            return;
        }

        setSubmitting(true);
        try {
            // Mark as completed
            await updateAudit(audit.id, { status: 'completed' });
            setAudit((prev) => ({ ...prev, status: 'completed' }));

            if (online) {
                // Sync immediately
                const result = await syncPendingAudits();
                if (result.synced > 0) {
                    setSubmitResult({
                        success: true,
                        message: 'Audit submitted successfully!',
                        details: result.audits[0]?.result,
                    });
                } else if (result.audits && result.audits[0]?.error) {
                    // Show actual error message
                    const errorMsg = result.audits[0].error.message || 'Unknown error';
                    setSubmitResult({
                        success: false,
                        message: `Sync failed: ${errorMsg}`,
                    });
                    console.error('[SUBMIT] Sync error:', result.audits[0].error);
                } else {
                    setSubmitResult({
                        success: false,
                        message: 'Sync failed. Will retry when online.',
                    });
                }
            } else {
                setSubmitResult({
                    success: true,
                    message: 'Audit saved! Will sync when online.',
                    offline: true,
                });
            }
        } catch (err) {
            console.error('Submit failed:', err);
            setSubmitResult({
                success: false,
                message: 'Failed to submit: ' + err.message,
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Calculate summary
    const getSummary = () => {
        if (!audit?.checklist?.sections) return { total: 0, yes: 0, no: 0 };

        let total = 0, yes = 0, no = 0;

        for (const section of audit.checklist.sections) {
            // Get all items - support both old (items) and new (subsections) structure
            const allItems = [];
            if (section.subsections && section.subsections.length > 0) {
                for (const sub of section.subsections) {
                    allItems.push(...(sub.items || []));
                }
            } else {
                allItems.push(...(section.items || []));
            }

            for (const item of allItems) {
                total++;
                const itemId = item.sl_no || item.slNo || item.item_id;
                const response = audit.responses[itemId]?.response;
                if (response === 'YES') yes++;
                else if (response === 'NO') no++;
            }
        }

        return { total, yes, no };
    };

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner} />
            </div>
        );
    }

    if (submitResult?.success && !submitResult.offline) {
        return (
            <main className={styles.successPage}>
                <div className={styles.successContent}>
                    <div className={styles.successIcon}>✓</div>
                    <h1>Audit Submitted!</h1>
                    <p>{submitResult.message}</p>

                    {submitResult.details && (
                        <div className={styles.links}>
                            <a href={submitResult.details.sheet?.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                                📊 View Checklist Sheet
                            </a>
                            <a href={submitResult.details.presentation?.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                                📑 View Report PPT
                            </a>
                            <a href={submitResult.details.folders?.auditFolderLink} target="_blank" rel="noopener noreferrer" className={styles.link}>
                                📁 View Folder
                            </a>
                        </div>
                    )}

                    <Button onClick={() => router.push('/')} fullWidth>
                        Back to Home
                    </Button>
                </div>
            </main>
        );
    }

    const summary = getSummary();

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <button onClick={() => router.back()} className={styles.backBtn}>
                    ← Back
                </button>
                <h1 className={styles.title}>Review Audit</h1>
            </header>

            {!online && (
                <div className="offline-banner">
                    📵 Offline – Audit will sync when connected
                </div>
            )}

            <div className={styles.content}>
                {/* Audit Info */}
                <div className={styles.infoCard}>
                    <h3>{audit.siteName}</h3>
                    <p>{audit.clientName}</p>
                    <p className={styles.date}>{new Date(audit.createdAt).toLocaleDateString()}</p>
                </div>

                {/* Summary */}
                <div className={styles.summaryCard}>
                    <h3>Summary</h3>
                    <div className={styles.summaryGrid}>
                        <div className={styles.stat}>
                            <span className={styles.statValue}>{summary.total}</span>
                            <span className={styles.statLabel}>Total</span>
                        </div>
                        <div className={`${styles.stat} ${styles.yes}`}>
                            <span className={styles.statValue}>{summary.yes}</span>
                            <span className={styles.statLabel}>Yes</span>
                        </div>
                        <div className={`${styles.stat} ${styles.no}`}>
                            <span className={styles.statValue}>{summary.no}</span>
                            <span className={styles.statLabel}>No</span>
                        </div>
                    </div>
                </div>

                {/* Photos */}
                <div className={styles.infoCard}>
                    <h3>📷 Photos Captured: {photos.length}</h3>
                </div>

                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                    <div className={styles.errorsCard}>
                        <h3>⚠ Issues Found ({validationErrors.length})</h3>
                        <ul className={styles.errorList}>
                            {validationErrors.slice(0, 10).map((err, idx) => (
                                <li key={idx} className={styles[err.type]}>
                                    {err.message}
                                </li>
                            ))}
                            {validationErrors.length > 10 && (
                                <li>...and {validationErrors.length - 10} more</li>
                            )}
                        </ul>
                    </div>
                )}

                {submitResult && !submitResult.success && (
                    <div className={styles.errorsCard}>
                        <p>{submitResult.message}</p>
                    </div>
                )}
            </div>

            <footer className={styles.footer}>
                <Button
                    onClick={handleSubmit}
                    fullWidth
                    size="large"
                    loading={submitting || syncing}
                    disabled={validationErrors.some(e => e.type === 'missing')}
                >
                    {online ? 'Submit Audit' : 'Save & Submit When Online'}
                </Button>
            </footer>
        </main>
    );
}
