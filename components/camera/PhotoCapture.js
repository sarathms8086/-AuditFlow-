/**
 * PhotoCapture Component
 * 
 * Modal camera interface for capturing photos
 */

'use client';

import { useEffect } from 'react';
import { useCamera } from '@/hooks/useCamera';
import styles from './PhotoCapture.module.css';

export function PhotoCapture({ onCapture, onClose }) {
    const { isOpen, error, videoRef, canvasRef, openCamera, closeCamera, capturePhoto } = useCamera();

    useEffect(() => {
        openCamera();
        return () => closeCamera();
    }, []);

    const handleCapture = async () => {
        const photo = await capturePhoto();
        if (photo) {
            onCapture(photo);
        }
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3>Capture Photo</h3>
                    <button type="button" className={styles.closeBtn} onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className={styles.cameraContainer}>
                    {error ? (
                        <div className={styles.error}>
                            <p>📷 Camera Error</p>
                            <p>{error}</p>
                        </div>
                    ) : (
                        <>
                            <video
                                ref={videoRef}
                                className={styles.video}
                                autoPlay
                                playsInline
                                muted
                            />
                            <canvas ref={canvasRef} className={styles.canvas} />
                        </>
                    )}
                </div>

                <div className={styles.controls}>
                    <button
                        type="button"
                        className={styles.captureBtn}
                        onClick={handleCapture}
                        disabled={!isOpen || !!error}
                    >
                        <span className={styles.captureIcon}>📸</span>
                        Capture
                    </button>
                </div>
            </div>
        </div>
    );
}
