/**
 * Admin Page
 * 
 * Owner-only access to manage checklists
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { getAllChecklists, createChecklist, deleteChecklist, duplicateChecklist, initializeDefaultChecklists, syncLocalToCloud } from '@/lib/checklistDB';
import styles from './page.module.css';

// Owner email - only this email can access admin
const OWNER_EMAIL = 'sarathsharann@gmail.com';

export default function AdminPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [checklists, setChecklists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const authData = localStorage.getItem('auditflow_auth');
        if (!authData) {
            router.push('/');
            return;
        }

        try {
            const parsed = JSON.parse(authData);
            setUser(parsed.user);

            // Check if user is owner
            if (parsed.user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
                setIsAuthorized(true);
                await loadChecklists();
            } else {
                setIsAuthorized(false);
            }
        } catch (e) {
            console.error('Auth error:', e);
            router.push('/');
        } finally {
            setLoading(false);
        }
    };

    const loadChecklists = async () => {
        try {
            await initializeDefaultChecklists();
            const all = await getAllChecklists();
            setChecklists(all);
        } catch (e) {
            console.error('Failed to load checklists:', e);
        }
    };

    const handleCreateNew = async () => {
        const title = prompt('Enter checklist name:');
        if (!title) return;

        try {
            const newChecklist = await createChecklist({ title, sections: [] });
            router.push(`/admin/checklist/${newChecklist.id}`);
        } catch (e) {
            alert('Failed to create checklist');
        }
    };

    const handleEdit = (id) => {
        router.push(`/admin/checklist/${id}`);
    };

    const handleDelete = async (id, title) => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;

        try {
            await deleteChecklist(id);
            await loadChecklists();
        } catch (e) {
            alert('Failed to delete checklist');
        }
    };

    const handleDuplicate = async (id, title) => {
        const newTitle = prompt('Enter name for the duplicated checklist:', `Copy of ${title}`);
        if (!newTitle) return;

        try {
            const duplicated = await duplicateChecklist(id, newTitle);
            router.push(`/admin/checklist/${duplicated.id}`);
        } catch (e) {
            alert('Failed to duplicate checklist: ' + e.message);
        }
    };

    const handleSyncToCloud = async () => {
        setSyncing(true);
        try {
            const synced = await syncLocalToCloud();
            alert(`Successfully synced ${synced.length} checklists to cloud!`);
            await loadChecklists();
        } catch (e) {
            console.error('Sync failed:', e);
            alert('Failed to sync: ' + e.message);
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <main className={styles.unauthorized}>
                <div className={styles.card}>
                    <h1>🔒 Access Denied</h1>
                    <p>Only the owner can access this page.</p>
                    <Button onClick={() => router.push('/')}>Go Back</Button>
                </div>
            </main>
        );
    }

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <button onClick={() => router.push('/')} className={styles.backBtn}>
                    ← Back
                </button>
                <h1>Admin Panel</h1>
                <span className={styles.badge}>Owner</span>
            </header>

            <div className={styles.content}>
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2>📋 Checklists</h2>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <Button onClick={handleSyncToCloud} disabled={syncing} variant="secondary">
                                {syncing ? '☁️ Syncing...' : '☁️ Sync to Cloud'}
                            </Button>
                            <Button onClick={handleCreateNew}>+ New Checklist</Button>
                        </div>
                    </div>

                    {checklists.length === 0 ? (
                        <div className={styles.empty}>
                            <p>No checklists yet. Create your first one!</p>
                        </div>
                    ) : (
                        <div className={styles.list}>
                            {checklists.map((checklist) => (
                                <div key={checklist.id} className={styles.listItem}>
                                    <div className={styles.listInfo}>
                                        <h3>{checklist.title}</h3>
                                        <p>
                                            {checklist.sections?.length || 0} sections •{' '}
                                            {checklist.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0} items
                                        </p>
                                        <span className={styles.date}>
                                            Updated: {new Date(checklist.updatedAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className={styles.listActions}>
                                        <button onClick={() => handleDuplicate(checklist.id, checklist.title)} className={styles.editBtn} title="Duplicate Checklist">
                                            📋
                                        </button>
                                        <button onClick={() => handleEdit(checklist.id)} className={styles.editBtn}>
                                            ✏️ Edit
                                        </button>
                                        <button onClick={() => handleDelete(checklist.id, checklist.title)} className={styles.deleteBtn}>
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
