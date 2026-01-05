/**
 * Checklist Editor Page
 * 
 * Visual editor for creating/editing checklists
 * Shows one section at a time with tabs
 * Structure: Section > SubSection > Items + Tables
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { getChecklist, updateChecklist } from '@/lib/checklistDB';
import styles from './page.module.css';

const OWNER_EMAIL = 'sarathsharann@gmail.com';

// Electrical readings table template
const ELECTRICAL_TABLE_TEMPLATE = {
    type: 'electrical_readings',
    title: 'Electrical Readings',
    columns: ['READING POINT', ''],
    rows: [
        { label: 'PHASE TO PHASE VOLTAGE (V)', isHeader: true },
        { label: 'RY', value: '' },
        { label: 'YB', value: '' },
        { label: 'BR', value: '' },
        { label: 'PHASE TO NEUTRAL VOLTAGE (V)', isHeader: true },
        { label: 'RN', value: '' },
        { label: 'YN', value: '' },
        { label: 'BN', value: '' },
        { label: '', value: '', isSpacer: true },
        { label: 'NG', value: '' },
        { label: 'PHASE CURRENT (A)', isHeader: true },
        { label: 'R PHASE', value: '' },
        { label: 'Y PHASE', value: '' },
        { label: 'B PHASE', value: '' },
        { label: 'NEUTRAL', value: '' },
    ],
};

export default function ChecklistEditorPage() {
    const router = useRouter();
    const params = useParams();
    const [checklist, setChecklist] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

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
            if (parsed.user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
                setIsAuthorized(true);
                await loadChecklist();
            } else {
                router.push('/admin');
            }
        } catch (e) {
            router.push('/');
        }
    };

    const loadChecklist = async () => {
        try {
            const data = await getChecklist(params.id);
            if (!data) {
                alert('Checklist not found');
                router.push('/admin');
                return;
            }
            if (!data.sections) {
                data.sections = [];
            }
            setChecklist(data);
        } catch (e) {
            console.error('Failed to load checklist:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateChecklist(checklist.id, checklist);
            router.push('/admin');
        } catch (e) {
            alert('Failed to save: ' + e.message);
            setSaving(false);
        }
    };

    const handleTitleChange = (e) => {
        setChecklist({ ...checklist, title: e.target.value });
    };

    // Section operations
    const addSection = () => {
        const sectionId = `section_${Date.now()}`;
        const newSection = {
            section_id: sectionId,
            section_title: 'New Section',
            subsections: [],
            tables: [],
        };
        const newSections = [...(checklist.sections || []), newSection];
        setChecklist({ ...checklist, sections: newSections });
        setCurrentSectionIndex(newSections.length - 1);
    };

    const updateSection = (field, value) => {
        const sections = [...checklist.sections];
        sections[currentSectionIndex] = { ...sections[currentSectionIndex], [field]: value };
        setChecklist({ ...checklist, sections });
    };

    const deleteSection = () => {
        if (!confirm('Delete this section and all its contents?')) return;
        const sections = checklist.sections.filter((_, i) => i !== currentSectionIndex);
        setChecklist({ ...checklist, sections });
        setCurrentSectionIndex(Math.max(0, currentSectionIndex - 1));
    };

    // Table operations
    const addTable = () => {
        const sections = [...checklist.sections];
        const tableId = `table_${Date.now()}`;
        const newTable = {
            ...JSON.parse(JSON.stringify(ELECTRICAL_TABLE_TEMPLATE)),
            table_id: tableId,
        };
        sections[currentSectionIndex].tables = [...(sections[currentSectionIndex].tables || []), newTable];
        setChecklist({ ...checklist, sections });
    };

    const updateTableColumn = (tableIndex, colIndex, value) => {
        const sections = [...checklist.sections];
        const tables = [...(sections[currentSectionIndex].tables || [])];
        tables[tableIndex].columns[colIndex] = value;
        sections[currentSectionIndex].tables = tables;
        setChecklist({ ...checklist, sections });
    };

    const deleteTable = (tableIndex) => {
        if (!confirm('Delete this table?')) return;
        const sections = [...checklist.sections];
        sections[currentSectionIndex].tables = sections[currentSectionIndex].tables.filter((_, i) => i !== tableIndex);
        setChecklist({ ...checklist, sections });
    };

    // Subsection operations
    const addSubsection = () => {
        const sections = [...checklist.sections];
        const subsectionId = `subsection_${Date.now()}`;
        const newSubsection = {
            subsection_id: subsectionId,
            subsection_title: 'New Sub Title',
            items: [],
        };
        sections[currentSectionIndex].subsections = [...(sections[currentSectionIndex].subsections || []), newSubsection];
        setChecklist({ ...checklist, sections });
    };

    const updateSubsection = (subIndex, field, value) => {
        const sections = [...checklist.sections];
        const subsections = [...sections[currentSectionIndex].subsections];
        subsections[subIndex] = { ...subsections[subIndex], [field]: value };
        sections[currentSectionIndex] = { ...sections[currentSectionIndex], subsections };
        setChecklist({ ...checklist, sections });
    };

    const deleteSubsection = (subIndex) => {
        if (!confirm('Delete this sub-section and all its checkpoints?')) return;
        const sections = [...checklist.sections];
        sections[currentSectionIndex].subsections = sections[currentSectionIndex].subsections.filter((_, i) => i !== subIndex);
        setChecklist({ ...checklist, sections });
    };

    // Item operations
    const addItem = (subIndex) => {
        const sections = [...checklist.sections];
        const subsection = sections[currentSectionIndex].subsections[subIndex];
        const itemNum = (subsection.items?.length || 0) + 1;
        const newItem = {
            item_id: `${currentSectionIndex + 1}.${subIndex + 1}.${itemNum}`,
            sl_no: `${currentSectionIndex + 1}.${subIndex + 1}.${itemNum}`,
            checking_criteria: 'New checkpoint',
            response_type: 'yes_no',
            remarks_required_if: 'NO',
            photo_required: false,
        };
        subsection.items = [...(subsection.items || []), newItem];
        setChecklist({ ...checklist, sections });
    };

    const updateItem = (subIndex, itemIndex, field, value) => {
        const sections = [...checklist.sections];
        const items = [...sections[currentSectionIndex].subsections[subIndex].items];
        items[itemIndex] = { ...items[itemIndex], [field]: value };
        sections[currentSectionIndex].subsections[subIndex] = {
            ...sections[currentSectionIndex].subsections[subIndex],
            items
        };
        setChecklist({ ...checklist, sections });
    };

    const deleteItem = (subIndex, itemIndex) => {
        const sections = [...checklist.sections];
        sections[currentSectionIndex].subsections[subIndex].items =
            sections[currentSectionIndex].subsections[subIndex].items.filter((_, i) => i !== itemIndex);
        setChecklist({ ...checklist, sections });
    };

    if (loading || !isAuthorized) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
            </div>
        );
    }

    const sections = checklist.sections || [];
    const currentSection = sections[currentSectionIndex];

    return (
        <main className={styles.main}>
            {/* Header */}
            <header className={styles.header}>
                <button onClick={() => router.push('/admin')} className={styles.backBtn}>
                    ← Back
                </button>
                <input
                    type="text"
                    value={checklist.title}
                    onChange={handleTitleChange}
                    className={styles.titleInput}
                    placeholder="Checklist Title"
                />
                <Button onClick={handleSave} loading={saving}>
                    💾 Save
                </Button>
            </header>

            {/* Section Tabs */}
            <div className={styles.tabsContainer}>
                <div className={styles.tabs}>
                    {sections.map((section, idx) => (
                        <button
                            key={section.section_id}
                            className={`${styles.tab} ${idx === currentSectionIndex ? styles.tabActive : ''}`}
                            onClick={() => setCurrentSectionIndex(idx)}
                        >
                            {idx + 1}. {(section.section_title || 'Section').substring(0, 20)}
                        </button>
                    ))}
                    <button onClick={addSection} className={styles.addTabBtn}>
                        + Add Section
                    </button>
                </div>
            </div>

            {/* Current Section Content */}
            <div className={styles.content}>
                {sections.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No sections yet. Click "+ Add Section" to create your first section.</p>
                    </div>
                ) : currentSection ? (
                    <div className={styles.section}>
                        {/* Section Header */}
                        <div className={styles.sectionHeader}>
                            <span className={styles.sectionBadge}>Section {currentSectionIndex + 1}</span>
                            <input
                                type="text"
                                value={currentSection.section_title || ''}
                                onChange={(e) => updateSection('section_title', e.target.value)}
                                className={styles.sectionTitle}
                                placeholder="Section Title"
                            />
                            <button onClick={deleteSection} className={styles.deleteBtn}>
                                🗑️ Delete Section
                            </button>
                        </div>


                        {/* Subsections */}
                        {currentSection.subsections?.map((subsection, subIndex) => (
                            <div key={subsection.subsection_id} className={styles.subsection}>
                                <div className={styles.subsectionHeader}>
                                    <span className={styles.subsectionBadge}>Sub {currentSectionIndex + 1}.{subIndex + 1}</span>
                                    <input
                                        type="text"
                                        value={subsection.subsection_title || ''}
                                        onChange={(e) => updateSubsection(subIndex, 'subsection_title', e.target.value)}
                                        className={styles.subsectionTitle}
                                        placeholder="Sub Title"
                                    />
                                    <button onClick={() => deleteSubsection(subIndex)} className={styles.deleteSubBtn}>
                                        ✕
                                    </button>
                                </div>

                                {/* Items */}
                                <div className={styles.items}>
                                    {subsection.items?.map((item, iIndex) => (
                                        <div key={item.item_id} className={styles.item}>
                                            <div className={styles.itemHeader}>
                                                <span className={styles.itemNumber}>{item.sl_no}</span>
                                                <button onClick={() => deleteItem(subIndex, iIndex)} className={styles.itemDelete}>
                                                    ✕
                                                </button>
                                            </div>
                                            <textarea
                                                value={item.checking_criteria || ''}
                                                onChange={(e) => updateItem(subIndex, iIndex, 'checking_criteria', e.target.value)}
                                                className={styles.itemCriteria}
                                                placeholder="Enter checking criteria..."
                                                rows={2}
                                            />
                                            <div className={styles.itemOptions}>
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={item.photo_required || false}
                                                        onChange={(e) => updateItem(subIndex, iIndex, 'photo_required', e.target.checked)}
                                                    />
                                                    Photo Required
                                                </label>
                                                <label>
                                                    Remarks if:
                                                    <select
                                                        value={item.remarks_required_if || ''}
                                                        onChange={(e) => updateItem(subIndex, iIndex, 'remarks_required_if', e.target.value)}
                                                    >
                                                        <option value="">Never</option>
                                                        <option value="NO">NO</option>
                                                        <option value="YES">YES</option>
                                                    </select>
                                                </label>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button onClick={() => addItem(subIndex)} className={styles.addItemBtn}>
                                    + Add Checkpoint
                                </button>
                            </div>
                        ))}

                        {/* Add Sub Title Button */}
                        <button onClick={addSubsection} className={styles.addSubsectionBtn}>
                            + Add Sub Title
                        </button>

                        {/* Tables - Displayed after subsections */}
                        {currentSection.tables?.map((table, tableIndex) => (
                            <div key={table.table_id} className={styles.tableContainer}>
                                <div className={styles.tableHeader}>
                                    <span className={styles.tableBadge}>📊 Electrical Readings Table</span>
                                    <input
                                        type="text"
                                        value={table.columns[1] || ''}
                                        onChange={(e) => updateTableColumn(tableIndex, 1, e.target.value)}
                                        className={styles.tableNameInput}
                                        placeholder="Name of Section"
                                    />
                                    <button onClick={() => deleteTable(tableIndex)} className={styles.deleteSubBtn}>
                                        ✕
                                    </button>
                                </div>
                                <table className={styles.readingsTable}>
                                    <thead>
                                        <tr>
                                            <th>READING POINT</th>
                                            <th>{table.columns[1] || 'Value'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {table.rows.map((row, rowIndex) => (
                                            row.isHeader ? (
                                                <tr key={rowIndex} className={styles.headerRow}>
                                                    <td colSpan={2}>{row.label}</td>
                                                </tr>
                                            ) : row.isSpacer ? (
                                                <tr key={rowIndex} className={styles.spacerRow}>
                                                    <td colSpan={2}></td>
                                                </tr>
                                            ) : (
                                                <tr key={rowIndex}>
                                                    <td>{row.label}</td>
                                                    <td className={styles.inputCell}>—</td>
                                                </tr>
                                            )
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}

                        {/* Add Table Button at Bottom */}
                        <button onClick={addTable} className={styles.addTableBtn}>
                            + Add Table (for readings)
                        </button>
                    </div>
                ) : null}
            </div>
        </main>
    );
}
