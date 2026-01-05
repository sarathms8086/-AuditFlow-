/**
 * New Audit Page
 * 
 * Form to create a new audit with site details and checklist selection
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { createAudit } from '@/lib/db';
import { getAllChecklists, initializeDefaultChecklists } from '@/lib/checklistDB';
import styles from './page.module.css';

export default function NewAuditPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [checklists, setChecklists] = useState([]);
    const [loadingChecklists, setLoadingChecklists] = useState(true);
    const [formData, setFormData] = useState({
        siteName: '',
        location: '',
        projectManager: '',
        checklistType: '',
    });

    useEffect(() => {
        loadChecklists();
    }, []);

    const loadChecklists = async () => {
        try {
            await initializeDefaultChecklists();
            const all = await getAllChecklists();
            setChecklists(all);
            if (all.length > 0) {
                setFormData(prev => ({ ...prev, checklistType: all[0].id }));
            }
        } catch (e) {
            console.error('Failed to load checklists:', e);
        } finally {
            setLoadingChecklists(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Get user info
            const authData = localStorage.getItem('auditflow_auth');
            let auditorName = 'Unknown';
            if (authData) {
                const parsed = JSON.parse(authData);
                auditorName = parsed.user?.name || 'Unknown';
            }

            // Find selected checklist
            const selectedChecklist = checklists.find((c) => c.id === formData.checklistType);
            if (!selectedChecklist) {
                throw new Error('Please select a checklist');
            }

            // Create audit in IndexedDB
            const audit = await createAudit({
                ...formData,
                auditorName,
                checklist: selectedChecklist,
            });

            // Navigate to audit execution
            router.push(`/audit/${audit.id}`);
        } catch (err) {
            console.error('Failed to create audit:', err);
            alert('Failed to create audit: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <button onClick={() => router.back()} className={styles.backBtn}>
                    ← Back
                </button>
                <h1 className={styles.title}>New Audit</h1>
            </header>

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.field}>
                    <label htmlFor="siteName">Site Name *</label>
                    <input
                        type="text"
                        id="siteName"
                        name="siteName"
                        value={formData.siteName}
                        onChange={handleChange}
                        required
                        placeholder="Enter site name"
                    />
                </div>

                <div className={styles.field}>
                    <label htmlFor="location">Location</label>
                    <input
                        type="text"
                        id="location"
                        name="location"
                        value={formData.location}
                        onChange={handleChange}
                        placeholder="Enter site location"
                    />
                </div>

                <div className={styles.field}>
                    <label htmlFor="projectManager">Project Manager</label>
                    <input
                        type="text"
                        id="projectManager"
                        name="projectManager"
                        value={formData.projectManager}
                        onChange={handleChange}
                        placeholder="Enter project manager name"
                    />
                </div>

                <div className={styles.field}>
                    <label htmlFor="checklistType">Checklist Type *</label>
                    {loadingChecklists ? (
                        <p className={styles.loadingText}>Loading checklists...</p>
                    ) : checklists.length === 0 ? (
                        <p className={styles.noChecklists}>
                            No checklists available. Ask the owner to create one.
                        </p>
                    ) : (
                        <select
                            id="checklistType"
                            name="checklistType"
                            value={formData.checklistType}
                            onChange={handleChange}
                            required
                        >
                            {checklists.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.title} ({c.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0)} items)
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                <Button
                    type="submit"
                    fullWidth
                    size="large"
                    loading={loading}
                    disabled={checklists.length === 0}
                >
                    Start Audit
                </Button>
            </form>
        </main>
    );
}
