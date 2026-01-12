/**
 * Section Component
 * 
 * Renders section with subsections, items, and tables
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
    onResponseChange,
    onPhotoCapture,
    onPhotoDelete,
    onTableValueChange,
}) {
    const [isExpanded, setIsExpanded] = useState(true);

    const sectionTitle = section.section_title || section.sectionTitle;

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
                                    {table.rows?.map((row, rowIdx) => (
                                        row.isHeader ? (
                                            <tr key={rowIdx} className={styles.headerRow}>
                                                <td colSpan={2}>{row.label}</td>
                                            </tr>
                                        ) : row.isSpacer ? (
                                            <tr key={rowIdx} className={styles.spacerRow}>
                                                <td colSpan={2}></td>
                                            </tr>
                                        ) : (
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
                                        )
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
