/**
 * Audit Execution Page
 * 
 * Main audit interface showing one section at a time
 * Auto-saves to IndexedDB
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Section } from '@/components/checklist/Section';
import { Button } from '@/components/ui/Button';
import { useOffline } from '@/hooks/useOffline';
import { getAudit, updateAudit, savePhoto, getAuditPhotos, blobToBase64 } from '@/lib/db';
import { queuePhotoUpload } from '@/lib/backgroundUpload';
import { UploadBadge } from '@/components/ui/UploadBadge';
import styles from './page.module.css';

export default function AuditExecutionPage() {
    const router = useRouter();
    const params = useParams();
    const { online } = useOffline();

    const [audit, setAudit] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

    // Load audit data
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

            // Load photos
            const photoData = await getAuditPhotos(params.id);
            setPhotos(photoData);
        } catch (err) {
            console.error('Failed to load audit:', err);
            alert('Failed to load audit');
        } finally {
            setLoading(false);
        }
    };

    // Auto-save on response change
    const handleResponseChange = useCallback(async (itemId, response, remarks) => {
        if (!audit) return;

        setSaving(true);
        try {
            const newResponses = {
                ...audit.responses,
                [itemId]: { response, remarks, updatedAt: new Date().toISOString() },
            };

            const updatedAudit = await updateAudit(audit.id, {
                responses: newResponses,
                status: 'in_progress',
            });

            setAudit(updatedAudit);
        } catch (err) {
            console.error('Failed to save response:', err);
        } finally {
            setSaving(false);
        }
    }, [audit]);

    // Handle photo capture with background upload
    const handlePhotoCapture = useCallback(async (itemId, photo) => {
        if (!audit) return;

        try {
            // Save to IndexedDB first (instant)
            const saved = await savePhoto(audit.id, itemId, photo.blob, photo.filename);
            setPhotos((prev) => [...prev, saved]);

            // Convert to base64 for upload
            const base64 = await blobToBase64(photo.blob);

            // Queue for background upload (if online)
            if (navigator.onLine) {
                queuePhotoUpload({
                    ...saved,
                    base64,
                }, audit.id).catch(err => {
                    console.warn('Background upload queued, will retry:', err.message);
                });
            }
        } catch (err) {
            console.error('Failed to save photo:', err);
            alert('Failed to save photo');
        }
    }, [audit]);

    // Calculate progress for current section
    const calculateSectionProgress = (section) => {
        if (!section) return { answered: 0, total: 0, percent: 0 };

        let total = 0;
        let answered = 0;

        // Support both old (items) and new (subsections) structure
        if (section.subsections) {
            for (const sub of section.subsections) {
                for (const item of sub.items || []) {
                    total++;
                    const itemId = item.sl_no || item.slNo || item.item_id;
                    if (audit?.responses[itemId]?.response) {
                        answered++;
                    }
                }
            }
        } else {
            for (const item of section.items || []) {
                total++;
                const itemId = item.sl_no || item.slNo || item.item_id;
                if (audit?.responses[itemId]?.response) {
                    answered++;
                }
            }
        }

        return {
            answered,
            total,
            percent: total > 0 ? Math.round((answered / total) * 100) : 0,
        };
    };

    // Calculate total progress
    const calculateTotalProgress = () => {
        if (!audit?.checklist?.sections) return { answered: 0, total: 0, percent: 0 };

        let total = 0;
        let answered = 0;

        for (const section of audit.checklist.sections) {
            const sectionProgress = calculateSectionProgress(section);
            total += sectionProgress.total;
            answered += sectionProgress.answered;
        }

        return {
            answered,
            total,
            percent: total > 0 ? Math.round((answered / total) * 100) : 0,
        };
    };

    // Navigation
    const handleNextSection = () => {
        const sections = audit?.checklist?.sections || [];
        if (currentSectionIndex < sections.length - 1) {
            setCurrentSectionIndex(currentSectionIndex + 1);
            window.scrollTo(0, 0);
        }
    };

    const handlePrevSection = () => {
        if (currentSectionIndex > 0) {
            setCurrentSectionIndex(currentSectionIndex - 1);
            window.scrollTo(0, 0);
        }
    };

    const handleReview = () => {
        router.push(`/audit/${audit.id}/review`);
    };

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner} />
                <p>Loading audit...</p>
            </div>
        );
    }

    if (!audit) {
        return null;
    }

    const sections = audit.checklist?.sections || [];
    const currentSection = sections[currentSectionIndex];
    const totalSections = sections.length;
    const isFirstSection = currentSectionIndex === 0;
    const isLastSection = currentSectionIndex === totalSections - 1;
    const sectionProgress = calculateSectionProgress(currentSection);
    const totalProgress = calculateTotalProgress();

    return (
        <main className={styles.main}>
            {/* Header */}
            <header className={styles.header}>
                <button onClick={() => router.push('/')} className={styles.backBtn}>
                    ← Exit
                </button>
                <div className={styles.headerInfo}>
                    <h1 className={styles.title}>{audit.siteName}</h1>
                    <span className={styles.checklistName}>{audit.checklist?.title}</span>
                </div>
                {saving && <span className={styles.savingIndicator}>Saving...</span>}
                {audit && <UploadBadge auditId={audit.id} />}
            </header>

            {/* Offline Banner */}
            {!online && (
                <div className="offline-banner">
                    📵 Offline – Changes saved locally
                </div>
            )}

            {/* Section Navigation */}
            <div className={styles.sectionNav}>
                <div className={styles.sectionTitle}>
                    <span className={styles.sectionBadge}>
                        Section {currentSectionIndex + 1} of {totalSections}
                    </span>
                    <h2>{currentSection?.section_title || currentSection?.sectionTitle || 'Section'}</h2>
                </div>
                <div className={styles.sectionIndicators}>
                    {sections.map((_, idx) => (
                        <button
                            key={idx}
                            className={`${styles.indicator} ${idx === currentSectionIndex ? styles.indicatorActive : ''} ${calculateSectionProgress(sections[idx]).percent === 100 ? styles.indicatorComplete : ''}`}
                            onClick={() => { setCurrentSectionIndex(idx); window.scrollTo(0, 0); }}
                        >
                            {idx + 1}
                        </button>
                    ))}
                </div>
            </div>

            {/* Section Progress */}
            <div className={styles.progressSection}>
                <div className={styles.progressInfo}>
                    <span>This section: {sectionProgress.answered} / {sectionProgress.total}</span>
                    <span>Overall: {totalProgress.percent}%</span>
                </div>
                <div className={styles.progressBar}>
                    <div
                        className={styles.progressFill}
                        style={{ width: `${sectionProgress.percent}%` }}
                    />
                </div>
            </div>

            {/* Current Section Content */}
            <div className={styles.content}>
                {currentSection && (
                    <Section
                        key={currentSection.section_id || currentSection.sectionId}
                        section={currentSection}
                        responses={audit.responses}
                        photos={photos}
                        onResponseChange={handleResponseChange}
                        onPhotoCapture={handlePhotoCapture}
                        onTableValueChange={(tableRowId, value) => {
                            handleResponseChange(tableRowId, null, null);
                            // Store table values in responses
                            const newResponses = {
                                ...audit.responses,
                                [tableRowId]: { value, updatedAt: new Date().toISOString() },
                            };
                            updateAudit(audit.id, { responses: newResponses }).then(setAudit);
                        }}
                    />
                )}
            </div>

            {/* Footer Navigation */}
            <footer className={styles.footer}>
                <div className={styles.footerNav}>
                    <button
                        onClick={handlePrevSection}
                        className={styles.navBtn}
                        disabled={isFirstSection}
                    >
                        ← Previous
                    </button>

                    {isLastSection ? (
                        <Button onClick={handleReview} size="large">
                            Review & Submit →
                        </Button>
                    ) : (
                        <button onClick={handleNextSection} className={styles.navBtnPrimary}>
                            Next Section →
                        </button>
                    )}
                </div>
            </footer>
        </main>
    );
}
