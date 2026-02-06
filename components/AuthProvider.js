'use client';

/**
 * Auth Provider Component
 * 
 * Initializes token auto-refresh for authenticated users on app load.
 * Wrap this around your app content in the layout.
 */

import { useEffect } from 'react';
import { startAutoRefresh, isAuthenticated } from '@/lib/tokenManager';

export default function AuthProvider({ children }) {
    useEffect(() => {
        // Start auto-refresh if user is already logged in
        if (isAuthenticated()) {
            console.log('[AuthProvider] User authenticated, starting auto-refresh');
            startAutoRefresh();
        }
    }, []);

    return children;
}
