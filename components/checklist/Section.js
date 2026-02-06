/**
 * Section Component
 * 
 * Renders section with subsections, items, tables, and additional findings
 * Supports both old (items) and new (subsections) structure
 */

'use client';

import { useState } from 'react';
import { ChecklistItem } from './ChecklistItem';
import styles from './Section.module.css';

export function Section({
    section,
    responses,
    photos,
    tablePhotos = {},
    findings = [],
    onResponseChange,
    onPhotoCapture,
    onPhotoDelete,
    onTableValueChange,
    onTablePhotoCapture,
    onTablePhotoDelete,
    onFindingsChange,
}) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [newFinding, setNewFinding] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);
    const [editingText, setEditingText] = useState('');

    const sectionId = section.section_id || section.sectionId;
    const sectionTitle = section.section_title || section.sectionTitle;

    // Handle adding a new finding
    const handleAddFinding = () => {
        if (!newFinding.trim()) return;
        const updatedFindings = [...findings, newFinding.trim()];
        onFindingsChange?.(sectionId, updatedFindings);
        setNewFinding('');
    };

    // Handle deleting a finding
    const handleDeleteFinding = (index) => {
        const updatedFindings = findings.filter((_, i) => i !== index);
        onFindingsChange?.(sectionId, updatedFindings);
    };

    // Handle starting to edit a finding
    const handleStartEdit = (index) => {
        setEditingIndex(index);
        setEditingText(findings[index]);
    };

    // Handle saving edited finding
    const handleSaveEdit = () => {
        if (editingIndex === null) return;
        if (!editingText.trim()) {
            // If empty, delete the finding
            handleDeleteFinding(editingIndex);
        } else {
            const updatedFindings = [...findings];
            updatedFindings[editingIndex] = editingText.trim();
            onFindingsChange?.(sectionId, updatedFindings);
        }
        setEditingIndex(null);
        setEditingText('');
    };

    // Handle Enter key in input
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddFinding();
        }
    };

    // Handle Enter key in edit input
    const handleEditKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            setEditingIndex(null);
            setEditingText('');
        }
    };

    // Get all items - support both old (items) and new (subsections) structure
    const getAllItems = () => {
        const allItems = [];

        // New structure: subsections with items
        if (section.subsections && section.subsections.length > 0) {
            for (const sub of section.subsections) {
                for (const item of sub.items || []) {
                    allItems.push({
                        ...item,
                        subsectionTitle: sub.subsection_title || sub.subsectionTitle,
                    });
                }
            }
        }

        // Old structure: items directly under section
        if (section.items && section.items.length > 0) {
            allItems.push(...section.items);
        }

        return allItems;
    };

    const items = getAllItems();
    const tables = section.tables || [];

    // Calculate section progress
    const answeredCount = items.filter(item => {
        const itemId = item.sl_no || item.slNo || item.item_id;
        return responses[itemId]?.response;
    }).length;
    const progress = items.length > 0 ? Math.round((answeredCount / items.length) * 100) : 0;

    return (
        <div className={styles.section}>
            <button
                type="button"
                className={styles.header}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={styles.titleRow}>
                    <span className={`${styles.chevron} ${isExpanded ? styles.expanded : ''}`}>
                        ▼
                    </span>
                    <h3 className={styles.title}>{sectionTitle}</h3>
                </div>
                <div className={styles.progress}>
                    <span className={styles.progressText}>{answeredCount}/{items.length}</span>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </button>

            {isExpanded && (
                <div className={styles.content}>
                    {/* Render subsections */}
                    {section.subsections?.map((subsection, subIdx) => (
                        <div key={subsection.subsection_id || subIdx} className={styles.subsection}>
                            <div className={styles.items}>
                                {subsection.items?.map((item) => {
                                    const itemId = item.sl_no || item.slNo || item.item_id;
                                    return (
                                        <ChecklistItem
                                            key={itemId}
                                            item={item}
                                            response={responses[itemId]}
                                            photos={photos.filter(p => p.itemId === itemId)}
                                            onResponseChange={onResponseChange}
                                            onPhotoCapture={onPhotoCapture}
                                            onPhotoDelete={onPhotoDelete}
                                            subsectionTitle={subsection.subsection_title || subsection.subsectionTitle}
                                            sectionTitle={sectionTitle}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Render old-style items (if no subsections) */}
                    {(!section.subsections || section.subsections.length === 0) && section.items?.map((item) => {
                        const itemId = item.sl_no || item.slNo || item.item_id;
                        return (
                            <ChecklistItem
                                key={itemId}
                                item={item}
                                response={responses[itemId]}
                                photos={photos.filter(p => p.itemId === itemId)}
                                onResponseChange={onResponseChange}
                                onPhotoCapture={onPhotoCapture}
                                onPhotoDelete={onPhotoDelete}
                                sectionTitle={sectionTitle}
                            />
                        );
                    })}

                    {/* Render tables */}
                    {tables.map((table, tableIdx) => (
                        <div key={table.table_id || tableIdx} className={styles.tableContainer}>
                            <h4 className={styles.tableTitle}>
                                📊 {table.columns?.[1] || 'Electrical Readings'}
                            </h4>
                            <table className={styles.readingsTable}>
                                <thead>
                                    <tr>
                                        <th>READING POINT</th>
                                        <th>{table.columns?.[1] || 'Value'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {table.rows?.map((row, rowIdx) => {
                                        if (row.isHeader) {
                                            const tableHeaderId = `table_${table.table_id}_header_${rowIdx}`;
                                            const headerPhotos = tablePhotos[tableHeaderId] || [];
                                            const MAX_TABLE_PHOTOS = 4;

                                            return (
                                                <tr key={rowIdx} className={styles.headerRow}>
                                                    <td colSpan={2}>
                                                        <div className={styles.tableHeaderContent}>
                                                            <span className={styles.tableHeaderLabel}>{row.label}</span>
                                                            <div className={styles.tableHeaderPhotos}>
                                                                {/* Photo thumbnails */}
                                                                {headerPhotos.map((photo, pIdx) => (
                                                                    <div key={pIdx} className={styles.tablePhotoThumb}>
                                                                        <img src={photo.thumbnail || photo.url} alt="" />
                                                                        <button
                                                                            type="button"
                                                                            className={styles.tablePhotoDelete}
                                                                            onClick={() => onTablePhotoDelete?.(tableHeaderId, pIdx)}
                                                                        >×</button>
                                                                    </div>
                                                                ))}
                                                                {/* Camera button */}
                                                                {headerPhotos.length < MAX_TABLE_PHOTOS && (
                                                                    <label className={styles.tablePhotoBtn}>
                                                                        📷 {headerPhotos.length}/{MAX_TABLE_PHOTOS}
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            capture="environment"
                                                                            style={{ display: 'none' }}
                                                                            onChange={(e) => {
                                                                                const file = e.target.files?.[0];
                                                                                if (file) {
                                                                                    onTablePhotoCapture?.(tableHeaderId, row.label, file);
                                                                                    e.target.value = '';
                                                                                }
                                                                            }}
                                                                        />
                                                                    </label>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        } else if (row.isSpacer) {
                                            return (
                                                <tr key={rowIdx} className={styles.spacerRow}>
                                                    <td colSpan={2}></td>
                                                </tr>
                                            );
                                        } else {
                                            return (
                                                <tr key={rowIdx}>
                                                    <td>{row.label}</td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className={styles.tableInput}
                                                            placeholder="Enter value"
                                                            value={responses[`table_${table.table_id}_${rowIdx}`]?.value || ''}
                                                            onChange={(e) => onTableValueChange?.(
                                                                `table_${table.table_id}_${rowIdx}`,
                                                                e.target.value
                                                            )}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        }
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}

                    {/* Additional Findings Section */}
                    <div className={styles.findingsSection}>
                        <h4 className={styles.findingsTitle}>
                            📝 Additional Findings
                        </h4>

                        {/* List of existing findings */}
                        {findings.length > 0 && (
                            <div className={styles.findingsList}>
                                {findings.map((finding, idx) => (
                                    <div key={idx} className={styles.findingItem}>
                                        <span className={styles.findingNumber}>{idx + 1}.</span>
                                        {editingIndex === idx ? (
                                            <>
                                                <input
                                                    type="text"
                                                    className={styles.findingEditInput}
                                                    value={editingText}
                                                    onChange={(e) => setEditingText(e.target.value)}
                                                    onKeyDown={handleEditKeyPress}
                                                    autoFocus
                                                />
                                                <button
                                                    type="button"
                                                    className={styles.findingSaveBtn}
                                                    onClick={handleSaveEdit}
                                                >
                                                    ✓
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <span
                                                    className={styles.findingText}
                                                    onClick={() => handleStartEdit(idx)}
                                                    title="Click to edit"
                                                >
                                                    {finding}
                                                </span>
                                                <button
                                                    type="button"
                                                    className={styles.findingEditBtn}
                                                    onClick={() => handleStartEdit(idx)}
                                                    title="Edit finding"
                                                >
                                                    ✎
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            className={styles.findingDeleteBtn}
                                            onClick={() => handleDeleteFinding(idx)}
                                            title="Delete finding"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add new finding input */}
                        <div className={styles.findingsInput}>
                            <input
                                type="text"
                                className={styles.findingTextInput}
                                placeholder="Enter additional finding..."
                                value={newFinding}
                                onChange={(e) => setNewFinding(e.target.value)}
                                onKeyPress={handleKeyPress}
                            />
                            <button
                                type="button"
                                className={styles.addFindingBtn}
                                onClick={handleAddFinding}
                                disabled={!newFinding.trim()}
                            >
                                + Add
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
