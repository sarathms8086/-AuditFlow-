/**
 * Auth Success Page
 * 
 * Handles OAuth callback - extracts tokens from URL fragment and stores them
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAutoRefresh } from '@/lib/tokenManager';
import styles from './page.module.css';

export default function AuthSuccessPage() {
    const router = useRouter();
    const [status, setStatus] = useState('Processing...');

    useEffect(() => {
        // Extract token from URL hash
        const hash = window.location.hash;
        if (!hash) {
            setStatus('No authentication data received');
            return;
        }

        try {
            // Parse token=... from hash
            const tokenParam = hash.split('token=')[1];
            if (!tokenParam) {
                setStatus('Invalid authentication data');
                return;
            }

            const tokenData = JSON.parse(decodeURIComponent(tokenParam));

            // Store in localStorage
            localStorage.setItem('auditflow_auth', JSON.stringify(tokenData));

            // Start automatic token refresh timer (every 50 minutes)
            startAutoRefresh();

            setStatus('Login successful! Redirecting...');

            // Redirect to home
            setTimeout(() => {
                router.push('/');
            }, 1000);
        } catch (err) {
            console.error('Auth error:', err);
            setStatus('Failed to process authentication');
        }
    }, [router]);

    return (
        <main className={styles.main}>
            <div className={styles.content}>
                <div className={styles.spinner} />
                <p>{status}</p>
            </div>
        </main>
    );
}
