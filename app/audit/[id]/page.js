/**
 * Audit Execution Page
 * 
 * Main audit interface showing one section at a time
 * Auto-saves to IndexedDB
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Section } from '@/components/checklist/Section';
import { Button } from '@/components/ui/Button';
import { useOffline } from '@/hooks/useOffline';
import { getAudit, updateAudit, savePhoto, getAuditPhotos, blobToBase64, deletePhoto } from '@/lib/db';
import { queuePhotoUpload } from '@/lib/backgroundUpload';
import { startAutoBackup, getLastBackupTime } from '@/lib/autoBackup';
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
    const [sectionFindings, setSectionFindings] = useState({}); // { sectionId: [finding1, finding2] }
    const [tablePhotos, setTablePhotos] = useState({}); // { tableHeaderId: [{url, thumbnail}, ...] }
    const stopBackupRef = useRef(null); // Reference to stop auto-backup function

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

            // Load section findings if they exist
            if (auditData.sectionFindings) {
                setSectionFindings(auditData.sectionFindings);
            }

            // Load table photos if they exist
            if (auditData.tablePhotos) {
                setTablePhotos(auditData.tablePhotos);
            }

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

    // Start auto-backup when audit loads
    useEffect(() => {
        if (!audit?.driveResources?.auditFolderId) return;

        // Function to get latest audit data for backup
        const getLatestData = () => ({
            siteName: audit.siteName,
            clientName: audit.clientName,
            auditorName: audit.auditorName,
            location: audit.location,
            responses: audit.responses,
            sectionFindings,
            tablePhotos,
            checklistId: audit.checklistId,
            checklistTitle: audit.checklistTitle,
        });

        // Start auto-backup (every 2 minutes)
        stopBackupRef.current = startAutoBackup(audit, getLatestData);
        console.log('[AUDIT] Auto-backup started');

        // Cleanup on unmount
        return () => {
            if (stopBackupRef.current) {
                stopBackupRef.current();
            }
        };
    }, [audit?.id, audit?.driveResources?.auditFolderId]);

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

    // Handle section findings change
    const handleFindingsChange = useCallback(async (sectionId, findings) => {
        if (!audit) return;

        const newFindings = {
            ...sectionFindings,
            [sectionId]: findings,
        };
        setSectionFindings(newFindings);

        // Save to IndexedDB
        try {
            await updateAudit(audit.id, { sectionFindings: newFindings });
        } catch (err) {
            console.error('Failed to save findings:', err);
        }
    }, [audit, sectionFindings]);

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
                }, audit.id, audit.driveResources).catch(err => {
                    console.warn('Background upload queued, will retry:', err.message);
                });
            }
        } catch (err) {
            console.error('Failed to save photo:', err);
            alert('Failed to save photo');
        }
    }, [audit]);

    // Handle photo deletion
    const handlePhotoDelete = useCallback(async (photoId) => {
        if (!photoId) return;

        try {
            await deletePhoto(photoId);
            setPhotos((prev) => prev.filter(p => p.id !== photoId));
            console.log('[PHOTO] Deleted photo:', photoId);
        } catch (err) {
            console.error('Failed to delete photo:', err);
            alert('Failed to delete photo');
        }
    }, []);

    // Handle table photo capture - saves to IndexedDB and queues upload like regular photos
    const handleTablePhotoCapture = useCallback(async (tableHeaderId, headerLabel, file) => {
        if (!audit) return;

        try {
            // Convert File to Blob if needed
            const blob = file instanceof Blob ? file : new Blob([file], { type: file.type });

            // Save to IndexedDB photos table (using tableHeaderId as itemId)
            const saved = await savePhoto(audit.id, tableHeaderId, blob, file.name || `table_photo_${Date.now()}.jpg`);
            setPhotos((prev) => [...prev, saved]);

            // Create thumbnail for display in tablePhotos
            const thumbnail = await createThumbnail(file);

            // Also track in tablePhotos state for UI display
            const newTablePhotos = { ...tablePhotos };
            if (!newTablePhotos[tableHeaderId]) {
                newTablePhotos[tableHeaderId] = [];
            }
            newTablePhotos[tableHeaderId].push({
                id: saved.id, // Link to photos DB record
                url: saved.url,
                thumbnail,
                headerLabel,
                filename: file.name,
                createdAt: new Date().toISOString(),
            });
            setTablePhotos(newTablePhotos);
            await updateAudit(audit.id, { tablePhotos: newTablePhotos });

            // Queue for background upload to Google Drive
            if (navigator.onLine) {
                const base64 = await blobToBase64(blob);
                queuePhotoUpload({
                    ...saved,
                    base64,
                }, audit.id, audit.driveResources).catch(err => {
                    console.warn('Background upload queued, will retry:', err.message);
                });
            }

            console.log('[TABLE PHOTO] Added and queued:', tableHeaderId);
        } catch (err) {
            console.error('Failed to save table photo:', err);
            alert('Failed to save photo');
        }
    }, [audit, tablePhotos]);

    // Handle table photo deletion
    const handleTablePhotoDelete = useCallback(async (tableHeaderId, photoIndex) => {
        if (!audit) return;

        try {
            const newTablePhotos = { ...tablePhotos };
            if (newTablePhotos[tableHeaderId]) {
                const photo = newTablePhotos[tableHeaderId][photoIndex];

                // Delete from photos IndexedDB if we have the photo id
                if (photo?.id) {
                    await deletePhoto(photo.id);
                    setPhotos((prev) => prev.filter(p => p.id !== photo.id));
                }

                // Revoke object URL
                if (photo?.url) URL.revokeObjectURL(photo.url);

                newTablePhotos[tableHeaderId].splice(photoIndex, 1);

                // Remove empty arrays
                if (newTablePhotos[tableHeaderId].length === 0) {
                    delete newTablePhotos[tableHeaderId];
                }
            }

            setTablePhotos(newTablePhotos);

            // Save to IndexedDB
            await updateAudit(audit.id, { tablePhotos: newTablePhotos });
            console.log('[TABLE PHOTO] Deleted photo from:', tableHeaderId);
        } catch (err) {
            console.error('Failed to delete table photo:', err);
            alert('Failed to delete photo');
        }
    }, [audit, tablePhotos]);

    // Helper function to create thumbnail
    const createThumbnail = async (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 100;
                    const scale = Math.min(MAX_SIZE / img.width, MAX_SIZE / img.height);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    };

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
                        findings={sectionFindings[currentSection.section_id || currentSection.sectionId] || []}
                        tablePhotos={tablePhotos}
                        onResponseChange={handleResponseChange}
                        onPhotoCapture={handlePhotoCapture}
                        onPhotoDelete={handlePhotoDelete}
                        onFindingsChange={handleFindingsChange}
                        onTablePhotoCapture={handleTablePhotoCapture}
                        onTablePhotoDelete={handleTablePhotoDelete}
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
