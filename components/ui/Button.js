/**
 * Button Component
 * 
 * Reusable button with variants and loading state
 */

'use client';

import styles from './Button.module.css';

export function Button({
    children,
    variant = 'primary', // primary, secondary, danger, outline
    size = 'medium', // small, medium, large
    loading = false,
    disabled = false,
    fullWidth = false,
    onClick,
    type = 'button',
    ...props
}) {
    const classNames = [
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        loading && styles.loading,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <button
            type={type}
            className={classNames}
            disabled={disabled || loading}
            onClick={onClick}
            {...props}
        >
            {loading && (
                <span className={styles.spinner}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="10" strokeWidth="4" opacity="0.25" />
                        <path d="M4 12a8 8 0 018-8" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                </span>
            )}
            <span className={loading ? styles.textHidden : ''}>{children}</span>
        </button>
    );
}
