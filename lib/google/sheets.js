/**
 * Google Sheets API utilities
 * Creates one sheet per section
 */

import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth';

/**
 * Create a checklist spreadsheet with multiple sheets (one per section)
 */
export async function createChecklistSpreadsheet(accessToken, title, auditData, sections, responses) {
    const auth = getAuthenticatedClient(accessToken);
    const sheets = google.sheets({ version: 'v4', auth });

    // Create sheet definitions - one for each section
    const sheetDefinitions = sections.map((section, idx) => ({
        properties: {
            sheetId: idx,
            title: (section.section_title || section.sectionTitle || `Section ${idx + 1}`).substring(0, 100),
            gridProperties: { frozenRowCount: 7 },
        },
    }));

    // Create spreadsheet with all section sheets
    const spreadsheet = await sheets.spreadsheets.create({
        resource: {
            properties: { title },
            sheets: sheetDefinitions,
        },
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;

    // Populate each sheet with section data
    for (let idx = 0; idx < sections.length; idx++) {
        const section = sections[idx];
        const sheetTitle = (section.section_title || section.sectionTitle || `Section ${idx + 1}`).substring(0, 100);
        const sheetId = idx;

        // Prepare header rows
        const headerRows = [
            [`ELECTRICAL SITE AUDIT - ${sheetTitle}`],
            [],
            ['Checked Date:', auditData.auditDate || new Date().toLocaleDateString()],
            ['Checked By:', auditData.auditorName || auditData.checkedBy || 'Unknown'],
            ['Project Manager:', auditData.projectManager || ''],
            ['Site Name:', auditData.siteName || ''],
            ['Sl No', 'Checking Criteria', 'Yes', 'No', 'Remarks'],
        ];

        // Track which row indices are actual checkpoints (need checkboxes)
        const checkpointRowIndices = [];
        const dataRows = [];

        if (section.subsections && section.subsections.length > 0) {
            // New structure with subsections - subsection title as header row
            for (const sub of section.subsections) {
                const subTitle = sub.subsection_title || sub.subsectionTitle || '';
                // Add subsection title as a header row (no checkboxes)
                if (subTitle) {
                    dataRows.push([subTitle, '', '', '', '']); // Subsection header row
                }
                // Add checkpoints under this subsection (with checkboxes)
                for (const item of sub.items || []) {
                    const itemId = item.sl_no || item.slNo || item.item_id;
                    const resp = responses[itemId] || {};
                    checkpointRowIndices.push(dataRows.length); // Track this row
                    dataRows.push([
                        itemId || '',
                        item.checking_criteria || item.checkingCriteria || '',
                        resp.response === 'YES',
                        resp.response === 'NO',
                        resp.remarks || '',
                    ]);
                }
            }
        } else {
            // Old structure with items directly under section
            for (const item of section.items || []) {
                const itemId = item.sl_no || item.slNo || item.item_id;
                const resp = responses[itemId] || {};
                checkpointRowIndices.push(dataRows.length); // Track this row
                dataRows.push([
                    itemId || '',
                    item.checking_criteria || item.checkingCriteria || '',
                    resp.response === 'YES',
                    resp.response === 'NO',
                    resp.remarks || '',
                ]);
            }
        }

        // Add electrical readings tables if present
        const tableRows = [];
        if (section.tables && Array.isArray(section.tables) && section.tables.length > 0) {
            for (const table of section.tables) {
                try {
                    // Add empty row for separation
                    tableRows.push([]);
                    // Add table title
                    const tableTitle = table.title || 'Electrical Readings';
                    tableRows.push([tableTitle, '', '', '', '']);
                    // Add table header
                    tableRows.push(['READING POINT', 'VALUE', '', '', '']);

                    // Add table rows
                    const rows = table.rows || [];
                    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
                        const row = rows[rowIdx];
                        if (row && row.isHeader) {
                            tableRows.push([row.label || '', '', '', '', '']);
                        } else if (row && !row.isSpacer) {
                            // Get value from item itself or from responses
                            const tableId = table.table_id || `table_${rowIdx}`;
                            const tableRowId = `table_${tableId}_${rowIdx}`;
                            // Check both row.value and responses
                            let tableValue = row.value || '';
                            if (responses && responses[tableRowId]) {
                                tableValue = responses[tableRowId].value || responses[tableRowId] || tableValue;
                            }
                            tableRows.push([row.label || '', tableValue, '', '', '']);
                        }
                    }
                } catch (tableErr) {
                    console.error('Error processing table:', tableErr);
                    // Continue with other tables if one fails
                }
            }
        }

        // Add section findings if present
        const findingsRows = [];
        const sectionFindings = auditData.sectionFindings || {};
        const sectionId = section.section_id || section.sectionId;
        const findings = sectionFindings[sectionId] || [];

        if (findings.length > 0) {
            // Add empty row for separation
            findingsRows.push([]);
            // Add findings header
            findingsRows.push(['ADDITIONAL FINDINGS', '', '', '', '']);
            findingsRows.push(['SL NO', 'REMARK', '', '', '']);
            // Add each finding with serial number
            for (let i = 0; i < findings.length; i++) {
                findingsRows.push([i + 1, findings[i], '', '', '']);
            }
        }

        const allRows = [...headerRows, ...dataRows, ...tableRows, ...findingsRows];

        // Update sheet with data
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetTitle}'!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: allRows },
        });

        // Apply formatting
        const formatRequests = [
            // Title formatting
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                    cell: {
                        userEnteredFormat: {
                            textFormat: { bold: true, fontSize: 14 },
                            backgroundColor: { red: 0.1, green: 0.2, blue: 0.4 },
                            textFormat: { bold: true, fontSize: 14, foregroundColor: { red: 1, green: 1, blue: 1 } },
                        },
                    },
                    fields: 'userEnteredFormat(textFormat,backgroundColor)',
                },
            },
            // Header row formatting
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 6, endRowIndex: 7 },
                    cell: {
                        userEnteredFormat: {
                            textFormat: { bold: true },
                            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                        },
                    },
                    fields: 'userEnteredFormat(textFormat,backgroundColor)',
                },
            },
            // Column widths
            {
                updateDimensionProperties: {
                    range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
                    properties: { pixelSize: 350 },
                    fields: 'pixelSize',
                },
            },
            {
                updateDimensionProperties: {
                    range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
                    properties: { pixelSize: 150 },
                    fields: 'pixelSize',
                },
            },
        ];

        // Add checkboxes ONLY for checkpoint rows (not subsection headers)
        // checkpointRowIndices contains the index within dataRows array
        const headerRowCount = 7; // Rows 1-7 are headers in the sheet

        for (const rowIdx of checkpointRowIndices) {
            const sheetRowIdx = headerRowCount + rowIdx; // Convert to sheet row index (0-based)
            // Add checkbox for Yes column (C = index 2)
            formatRequests.push({
                setDataValidation: {
                    range: { sheetId, startRowIndex: sheetRowIdx, endRowIndex: sheetRowIdx + 1, startColumnIndex: 2, endColumnIndex: 3 },
                    rule: { condition: { type: 'BOOLEAN' }, showCustomUi: true },
                },
            });
            // Add checkbox for No column (D = index 3)
            formatRequests.push({
                setDataValidation: {
                    range: { sheetId, startRowIndex: sheetRowIdx, endRowIndex: sheetRowIdx + 1, startColumnIndex: 3, endColumnIndex: 4 },
                    rule: { condition: { type: 'BOOLEAN' }, showCustomUi: true },
                },
            });
        }

        // Add borders around the entire data area (header row 7 through all data, table, and findings rows)
        const totalDataRows = dataRows.length + tableRows.length + findingsRows.length;
        if (totalDataRows > 0) {
            const borderStyle = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };
            formatRequests.push({
                updateBorders: {
                    range: {
                        sheetId,
                        startRowIndex: 6, // Header row (Sl No, Checking Criteria, etc.)
                        endRowIndex: headerRowCount + totalDataRows,
                        startColumnIndex: 0,
                        endColumnIndex: 5
                    },
                    top: borderStyle,
                    bottom: borderStyle,
                    left: borderStyle,
                    right: borderStyle,
                    innerHorizontal: borderStyle,
                    innerVertical: borderStyle,
                },
            });
        }

        try {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: { requests: formatRequests },
            });
        } catch (err) {
            console.log('Format error (non-fatal):', err.message);
        }
    }

    return {
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    };
}

/**
 * Add photo links to sheet
 */
export async function addPhotoLinksToSheet(accessToken, spreadsheetId, photoLinks) {
    const auth = getAuthenticatedClient(accessToken);
    const sheets = google.sheets({ version: 'v4', auth });

    const values = photoLinks.map(link => [`=HYPERLINK("${link.url}", "${link.filename}")`]);

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'Audit Checklist'!G${photoLinks[0]?.row || 8}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values },
    });
}
