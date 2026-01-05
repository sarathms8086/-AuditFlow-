/**
 * useCamera Hook
 * 
 * Provides camera access for photo capture
 */

'use client';

import { useState, useRef, useCallback } from 'react';

export function useCamera() {
    const [isOpen, setIsOpen] = useState(false);
    const [stream, setStream] = useState(null);
    const [error, setError] = useState(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    const openCamera = useCallback(async () => {
        setError(null);
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Rear camera on mobile
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
            });
            setStream(mediaStream);
            setIsOpen(true);

            // Wait for video element to be ready
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            }, 100);
        } catch (err) {
            setError(err.message || 'Failed to access camera');
            console.error('[CAMERA] Error:', err);
        }
    }, []);

    const closeCamera = useCallback(() => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
        }
        setIsOpen(false);
    }, [stream]);

    const capturePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return null;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        // Set canvas size to video size
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to blob
        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => {
                    const filename = `photo_${Date.now()}.jpg`;
                    resolve({ blob, filename });
                },
                'image/jpeg',
                0.85 // Quality
            );
        });
    }, []);

    return {
        isOpen,
        stream,
        error,
        videoRef,
        canvasRef,
        openCamera,
        closeCamera,
        capturePhoto,
    };
}
