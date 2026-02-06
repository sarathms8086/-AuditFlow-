/**
 * Google Sheets Service
 * 
 * Creates and populates audit checklist spreadsheets.
 * 
 * Sheet Format:
 * - Header section with audit metadata
 * - Checklist table with columns: Sl_No, Checking_Criteria, Yes, No, Remarks
 * - Checkboxes in Yes/No columns
 * - Excel-compatible formatting
 */

import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';

/**
 * Get Sheets API client
 */
function getSheetsClient(accessToken) {
    const auth = getAuthenticatedClient(accessToken);
    return google.sheets({ version: 'v4', auth });
}

/**
 * Get Drive API client (for copying templates)
 */
function getDriveClient(accessToken) {
    const auth = getAuthenticatedClient(accessToken);
    return google.drive({ version: 'v3', auth });
}

/**
 * Create a new spreadsheet from scratch (no template)
 */
export async function createChecklistSpreadsheet(accessToken, title, auditData, checklistItems) {
    const sheets = getSheetsClient(accessToken);

    // Create empty spreadsheet
    const response = await sheets.spreadsheets.create({
        resource: {
            properties: {
                title,
            },
            sheets: [{
                properties: {
                    title: 'Audit Checklist',
                    gridProperties: {
                        frozenRowCount: 7, // Freeze header rows
                    },
                },
            }],
        },
    });

    const spreadsheetId = response.data.spreadsheetId;

    // Populate with data
    await populateChecklistSheet(accessToken, spreadsheetId, auditData, checklistItems);

    // Apply formatting
    await applySheetFormatting(accessToken, spreadsheetId);

    return {
        spreadsheetId,
        spreadsheetUrl: response.data.spreadsheetUrl,
    };
}

/**
 * Copy an existing template spreadsheet
 */
export async function copySheetTemplate(accessToken, templateId, newTitle, folderId) {
    const drive = getDriveClient(accessToken);

    const response = await drive.files.copy({
        fileId: templateId,
        requestBody: {
            name: newTitle,
            parents: folderId ? [folderId] : undefined,
        },
    });

    return {
        spreadsheetId: response.data.id,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${response.data.id}/edit`,
    };
}

/**
 * Populate the checklist sheet with audit data
 */
async function populateChecklistSheet(accessToken, spreadsheetId, auditData, checklistItems) {
    const sheets = getSheetsClient(accessToken);

    // Build header rows
    const headerData = [
        ['ELECTRICAL SITE AUDIT CHECKLIST'],
        [''],
        [`Checked Date: ${auditData.auditDate}`, '', '', `Project Manager: ${auditData.projectManager || 'N/A'}`],
        [`Checked By: ${auditData.auditorName}`, '', '', `Site Name: ${auditData.siteName}`],
        [`Client: ${auditData.clientName}`, '', '', `Project: ${auditData.projectCode || 'N/A'}`],
        [''],
        ['Sl No', 'Checking Criteria', 'Yes', 'No', 'Remarks'], // Column headers
    ];

    // Build checklist rows
    const checklistRows = [];
    let currentSection = '';

    for (const item of checklistItems) {
        // Add section header row if new section
        if (item.sectionTitle && item.sectionTitle !== currentSection) {
            checklistRows.push([item.sectionTitle, '', '', '', '']);
            currentSection = item.sectionTitle;
        }

        // Add item row
        // Yes/No columns will be populated with TRUE/FALSE for checkbox values
        const yesValue = item.response === 'YES' ? true : false;
        const noValue = item.response === 'NO' ? true : false;

        checklistRows.push([
            item.slNo,
            item.checkingCriteria,
            yesValue,
            noValue,
            item.remarks || '',
        ]);
    }

    // Combine all data
    const allData = [...headerData, ...checklistRows];

    // Update sheet with all data
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Audit Checklist!A1',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: allData,
        },
    });

    // Insert checkboxes in Yes/No columns (starting from row 8 - after headers)
    await insertCheckboxes(accessToken, spreadsheetId, 7, checklistRows.length);
}

/**
 * Insert checkboxes in Yes/No columns
 */
async function insertCheckboxes(accessToken, spreadsheetId, startRow, rowCount) {
    const sheets = getSheetsClient(accessToken);

    // Get sheet ID
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = spreadsheet.data.sheets[0].properties.sheetId;

    const requests = [];

    // Checkbox data validation for Yes column (column C = index 2)
    // and No column (column D = index 3)
    for (let col of [2, 3]) {
        requests.push({
            setDataValidation: {
                range: {
                    sheetId,
                    startRowIndex: startRow,
                    endRowIndex: startRow + rowCount,
                    startColumnIndex: col,
                    endColumnIndex: col + 1,
                },
                rule: {
                    condition: {
                        type: 'BOOLEAN',
                    },
                    showCustomUi: true,
                },
            },
        });
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: { requests },
    });
}

/**
 * Apply formatting to make the sheet look professional
 */
async function applySheetFormatting(accessToken, spreadsheetId) {
    const sheets = getSheetsClient(accessToken);

    // Get sheet ID
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = spreadsheet.data.sheets[0].properties.sheetId;

    const requests = [
        // Title row - bold, larger font, centered
        {
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 5,
                },
                cell: {
                    userEnteredFormat: {
                        textFormat: {
                            bold: true,
                            fontSize: 14,
                        },
                        horizontalAlignment: 'CENTER',
                        backgroundColor: { red: 0.2, green: 0.4, blue: 0.6 },
                    },
                },
                fields: 'userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)',
            },
        },
        // Column headers row (row 7) - bold, background
        {
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: 6,
                    endRowIndex: 7,
                    startColumnIndex: 0,
                    endColumnIndex: 5,
                },
                cell: {
                    userEnteredFormat: {
                        textFormat: { bold: true },
                        backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                        horizontalAlignment: 'CENTER',
                    },
                },
                fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
            },
        },
        // Set column widths
        {
            updateDimensionProperties: {
                range: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 0,
                    endIndex: 1,
                },
                properties: { pixelSize: 80 },
                fields: 'pixelSize',
            },
        },
        {
            updateDimensionProperties: {
                range: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 1,
                    endIndex: 2,
                },
                properties: { pixelSize: 400 },
                fields: 'pixelSize',
            },
        },
        {
            updateDimensionProperties: {
                range: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 2,
                    endIndex: 4,
                },
                properties: { pixelSize: 60 },
                fields: 'pixelSize',
            },
        },
        {
            updateDimensionProperties: {
                range: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 4,
                    endIndex: 5,
                },
                properties: { pixelSize: 200 },
                fields: 'pixelSize',
            },
        },
        // Add borders to all cells
        {
            updateBorders: {
                range: {
                    sheetId,
                    startRowIndex: 6,
                    endRowIndex: 100, // Enough rows
                    startColumnIndex: 0,
                    endColumnIndex: 5,
                },
                top: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
                bottom: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
                left: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
                right: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
                innerHorizontal: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
                innerVertical: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
            },
        },
    ];

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: { requests },
    });
}

/**
 * Update specific cells with photo links
 */
export async function addPhotoLinksToSheet(accessToken, spreadsheetId, photoLinks) {
    const sheets = getSheetsClient(accessToken);

    // Add a "Photos" column if needed
    // For simplicity, we'll add links in the Remarks column with HYPERLINK formula

    const updates = photoLinks.map(({ row, url, filename }) => ({
        range: `Audit Checklist!F${row}`, // Column F for photo links
        values: [[`=HYPERLINK("${url}", "${filename}")`]],
    }));

    if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: updates,
            },
        });
    }
}
