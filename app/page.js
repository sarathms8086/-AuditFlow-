/**
 * Dashboard Page (Home)
 * 
 * Professional dashboard layout with:
 * - Header: Logo (left), User profile (right)
 * - Main: New Audit action (left), Audit history (right)
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useOffline } from '@/hooks/useOffline';
import { getAllAudits } from '@/lib/db';
import styles from './page.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function DashboardPage() {
  const router = useRouter();
  const { online, syncing, triggerSync } = useOffline();
  const [user, setUser] = useState(null);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }

    checkAuth();
    loadAudits();
  }, []);

  const checkAuth = () => {
    const authData = localStorage.getItem('auditflow_auth');
    if (authData) {
      try {
        const parsed = JSON.parse(authData);
        setUser(parsed.user);
      } catch (e) {
        console.error('Failed to parse auth data');
      }
    }
    setLoading(false);
  };

  const loadAudits = async () => {
    try {
      const allAudits = await getAllAudits();
      // Sort by date, newest first
      allAudits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAudits(allAudits);
    } catch (e) {
      console.error('Failed to load audits:', e);
    }
  };

  const handleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const handleLogout = () => {
    localStorage.removeItem('auditflow_auth');
    setUser(null);
  };

  const handleNewAudit = () => {
    router.push('/audit/new');
  };

  const handleContinueAudit = (auditId) => {
    router.push(`/audit/${auditId}`);
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: { text: 'Draft', class: styles.badgeDraft },
      in_progress: { text: 'In Progress', class: styles.badgeProgress },
      completed: { text: 'Completed', class: styles.badgeCompleted },
      synced: { text: 'Synced', class: styles.badgeSynced },
    };
    return badges[status] || badges.draft;
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
      </div>
    );
  }

  // Not logged in - show login page
  if (!user) {
    return (
      <main className={styles.loginPage}>
        <div className={styles.loginContainer}>
          <div className={styles.loginLogo}>⚡</div>
          <h1 className={styles.loginTitle}>AuditFlow</h1>
          <p className={styles.loginSubtitle}>Electrical Site Audit</p>

          <Button onClick={handleLogin} fullWidth size="large">
            <svg className={styles.googleIcon} viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </Button>

          <p className={styles.loginDisclaimer}>
            Your audit data is stored securely in your Google Drive
          </p>
          <p style={{ fontSize: '10px', color: '#999', marginTop: '20px' }}>v3.0.0 - Jan 5, 2026</p>
        </div>
      </main>
    );
  }

  // Logged in - show dashboard
  const pendingAudits = audits.filter(a => a.status !== 'synced');
  const completedAudits = audits.filter(a => a.status === 'synced');

  return (
    <main className={styles.dashboard}>
      {/* Offline Banner */}
      {!online && (
        <div className={styles.offlineBanner}>
          📵 You're offline – audits will sync when connected
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>⚡</div>
          <div className={styles.brandText}>
            <h1 className={styles.brandName}>AuditFlow</h1>
            <span className={styles.brandTagline}>Electrical Site Audit</span>
          </div>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.userMenu}>
            {user.picture && (
              <img src={user.picture} alt="" className={styles.userAvatar} />
            )}
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userEmail}>{user.email}</span>
            </div>
            {user.email?.toLowerCase() === 'sarathsharann@gmail.com' && (
              <button onClick={() => router.push('/admin')} className={styles.adminBtn} title="Admin Panel">
                ⚙️
              </button>
            )}
            <button onClick={handleLogout} className={styles.logoutBtn} title="Sign Out">
              ⏻
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.content}>
        {/* Left Section - New Audit */}
        <div className={styles.leftPanel}>
          <div className={styles.actionCard}>
            <div className={styles.actionIcon}>📋</div>
            <h2>Start New Audit</h2>
            <p>Create a new electrical site audit with digital checklists, photos, and automatic report generation.</p>
            <Button onClick={handleNewAudit} fullWidth size="large">
              + New Audit
            </Button>
          </div>

          {/* Sync Button */}
          {online && pendingAudits.some(a => a.status === 'completed') && (
            <Button onClick={triggerSync} variant="secondary" fullWidth loading={syncing}>
              🔄 Sync Pending Audits
            </Button>
          )}
        </div>

        {/* Right Section - Audit History */}
        <div className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h2>Your Audits</h2>
            <span className={styles.auditCount}>{audits.length} total</span>
          </div>

          {audits.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📭</div>
              <h3>No audits yet</h3>
              <p>Start your first audit to see it here</p>
            </div>
          ) : (
            <div className={styles.auditList}>
              {audits.map((audit) => {
                const statusBadge = getStatusBadge(audit.status);
                return (
                  <div
                    key={audit.id}
                    className={styles.auditCard}
                    onClick={() => audit.status !== 'synced' && handleContinueAudit(audit.id)}
                  >
                    <div className={styles.auditCardHeader}>
                      <h4 className={styles.auditSiteName}>{audit.siteName}</h4>
                      <span className={`${styles.badge} ${statusBadge.class}`}>
                        {statusBadge.text}
                      </span>
                    </div>
                    <p className={styles.auditClient}>{audit.clientName}</p>
                    <div className={styles.auditMeta}>
                      <span className={styles.auditDate}>
                        📅 {new Date(audit.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                      <span className={styles.auditChecklist}>
                        📋 {audit.checklist?.title || 'Checklist'}
                      </span>
                    </div>
                    {audit.status !== 'synced' && (
                      <div className={styles.auditAction}>
                        <span>Continue →</span>
                      </div>
                    )}
                    {audit.status === 'synced' && audit.syncResult && (
                      <div className={styles.syncedLinks}>
                        <a href={audit.syncResult.sheet?.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                          📊 Sheet
                        </a>
                        <a href={audit.syncResult.presentation?.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                          📑 Report
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <span>AuditFlow v1.0.0</span>
        <span>•</span>
        <span>Made for Field Engineers</span>
      </footer>
    </main>
  );
}
