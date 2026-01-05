/**
 * Auth Error Page
 * 
 * Displays authentication errors
 */

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

function AuthErrorContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const message = searchParams.get('message') || 'An authentication error occurred';

    return (
        <main className={styles.main}>
            <div className={styles.content}>
                <div className={styles.errorIcon}>✕</div>
                <h1>Authentication Failed</h1>
                <p>{message}</p>
                <Button onClick={() => router.push('/')}>
                    Try Again
                </Button>
            </div>
        </main>
    );
}

export default function AuthErrorPage() {
    return (
        <Suspense fallback={
            <main className={styles.main}>
                <div className={styles.content}>
                    <p>Loading...</p>
                </div>
            </main>
        }>
            <AuthErrorContent />
        </Suspense>
    );
}
