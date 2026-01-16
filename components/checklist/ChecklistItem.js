/**
 * ChecklistItem Component
 * 
 * Single checklist item with:
 * - Yes/No/NA toggle
 * - Remarks field (shows when NO selected)
 * - Photo capture button (up to 3 photos)
 * - Delete photo functionality
 */

'use client';

import { useState, useEffect } from 'react';
import styles from './ChecklistItem.module.css';

const MAX_PHOTOS = 3;

export function ChecklistItem({
    item,
    response,
    onResponseChange,
    onPhotoCapture,
    onPhotoDelete,
    photos = [],
    subsectionTitle,
}) {
    const [showRemarks, setShowRemarks] = useState(false);
    const [localRemarks, setLocalRemarks] = useState(response?.remarks || '');

    const slNo = item.sl_no || item.slNo;
    const checkingCriteria = item.checking_criteria || item.checkingCriteria;
    const photoRequired = item.photo_required || item.photoRequired;
    const remarksRequiredIf = item.remarks_required_if || item.remarksRequiredIf;

    // Show remarks if response requires it
    useEffect(() => {
        if (response?.response === remarksRequiredIf) {
            setShowRemarks(true);
        }
    }, [response?.response, remarksRequiredIf]);

    const handleResponseSelect = (value) => {
        onResponseChange(slNo, value, localRemarks);
        if (value === remarksRequiredIf) {
            setShowRemarks(true);
        }
    };

    const handleRemarksChange = (e) => {
        const remarks = e.target.value;
        setLocalRemarks(remarks);
        onResponseChange(slNo, response?.response, remarks);
    };

    // Handle file input capture (native camera)
    const handleFileCapture = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Create blob and filename like the original PhotoCapture did
            const photo = {
                blob: file,
                filename: `photo_${Date.now()}.jpg`,
            };
            onPhotoCapture(slNo, photo);
            e.target.value = ''; // Reset input for next capture
        }
    };

    const currentResponse = response?.response || null;

    return (
        <div className={styles.item}>
            <div className={styles.header}>
                <span className={styles.slNo}>{slNo}</span>
                {subsectionTitle && (
                    <span className={styles.subTitle}>{subsectionTitle}</span>
                )}
                <span className={styles.criteria}>{checkingCriteria}</span>
            </div>

            <div className={styles.controls}>
                {/* Yes/No Toggle */}
                <div className={styles.toggleGroup}>
                    <button
                        type="button"
                        className={`${styles.toggle} ${currentResponse === 'YES' ? styles.active : ''} ${styles.yes}`}
                        onClick={() => handleResponseSelect('YES')}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        className={`${styles.toggle} ${currentResponse === 'NO' ? styles.active : ''} ${styles.no}`}
                        onClick={() => handleResponseSelect('NO')}
                    >
                        No
                    </button>
                </div>

                {/* Photo Button - native file input for full quality */}
                {photos.length < MAX_PHOTOS && (
                    <label className={`${styles.photoBtn} ${photos.length > 0 ? styles.hasPhotos : ''}`}>
                        📷 {photos.length > 0 ? `${photos.length}/${MAX_PHOTOS}` : 'Add'}
                        {photoRequired && <span className={styles.required}>*</span>}
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={handleFileCapture}
                        />
                    </label>
                )}
                {photos.length >= MAX_PHOTOS && (
                    <span className={styles.photoMaxReached}>📷 {photos.length}/{MAX_PHOTOS}</span>
                )}
            </div>

            {/* Remarks Field */}
            {showRemarks && (
                <div className={styles.remarks}>
                    <label className={styles.remarksLabel}>
                        Remarks {remarksRequiredIf === currentResponse && <span className={styles.required}>*</span>}
                    </label>
                    <textarea
                        className={styles.remarksInput}
                        value={localRemarks}
                        onChange={handleRemarksChange}
                        placeholder="Enter remarks..."
                        rows={2}
                    />
                </div>
            )}



            {/* Photo Thumbnails with Delete Button */}
            {photos.length > 0 && (
                <div className={styles.thumbnails}>
                    {photos.map((photo, idx) => {
                        // Determine the image source based on photo status
                        let imageSrc = null;
                        if (photo.blob) {
                            // Photo has local blob - use it
                            imageSrc = URL.createObjectURL(photo.blob);
                        } else if (photo.driveLink) {
                            // Photo uploaded to Drive - use Drive link
                            imageSrc = photo.driveLink;
                        } else if (photo.driveFileId) {
                            // Has Drive file ID but no link - construct link
                            imageSrc = `https://drive.google.com/thumbnail?id=${photo.driveFileId}&sz=w200`;
                        }

                        return (
                            <div key={photo.id || idx} className={styles.thumbnail}>
                                {imageSrc ? (
                                    <img src={imageSrc} alt={`Photo ${idx + 1}`} />
                                ) : (
                                    <div className={styles.uploadedPlaceholder}>
                                        ☁️
                                    </div>
                                )}
                                {/* Delete button */}
                                <button
                                    type="button"
                                    className={styles.deleteBtn}
                                    onClick={() => onPhotoDelete && onPhotoDelete(photo.id)}
                                    title="Delete photo"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
