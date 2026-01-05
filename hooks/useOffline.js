/**
 * useOffline Hook
 * 
 * Tracks online/offline status and provides sync functionality
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { isOnline, syncPendingAudits, addSyncListener, setupAutoSync } from '@/lib/sync';

export function useOffline() {
    const [online, setOnline] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);

    useEffect(() => {
        // Set initial state
        setOnline(navigator.onLine);

        // Listen for online/offline events
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Setup auto sync
        setupAutoSync();

        // Listen for sync events
        const unsubscribe = addSyncListener((event) => {
            setSyncStatus(event);
            if (event.type === 'sync_batch_start') {
                setSyncing(true);
            } else if (event.type === 'sync_batch_complete' || event.type === 'sync_error') {
                setSyncing(false);
            }
        });

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            unsubscribe();
        };
    }, []);

    const triggerSync = useCallback(async () => {
        if (!online) return { offline: true };
        setSyncing(true);
        try {
            return await syncPendingAudits();
        } finally {
            setSyncing(false);
        }
    }, [online]);

    return {
        online,
        syncing,
        syncStatus,
        triggerSync,
    };
}
