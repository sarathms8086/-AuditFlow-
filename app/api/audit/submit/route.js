/**
 * Audit Submit API Route
 * POST /api/audit/submit
 * 
 * Submits audit and generates Google Drive folder, Sheet, and Slides
 */

import { NextResponse } from 'next/server';
import { createAuditFolderStructure, createSectionPhotoFolders, uploadPhoto, moveFileToFolder } from '@/lib/google/drive';
import { createChecklistSpreadsheet, addPhotoLinksToSheet } from '@/lib/google/sheets';
import { createAuditPresentation } from '@/lib/google/slides';

export const maxDuration = 60; // Max 60 seconds for Pro plan, 10 for free

/**
 * Process items in parallel batches
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item
 * @param {number} batchSize - Number of items to process concurrently
 */
async function processBatches(items, processor, batchSize = 5) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processor));
        results.push(...batchResults);
    }
    return results;
}

export async function POST(request) {
    const startTime = Date.now();
    const auditId = crypto.randomUUID();

    try {
        // Extract access token from header
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'No access token provided' }, { status: 401 });
        }
        const accessToken = authHeader.split(' ')[1];

        // Parse request body
        const { auditData, checklist, photos = [], responses: req_responses = {} } = await request.json();

        // EARLY DEBUG: Log photos array immediately
        console.log(`[SUBMIT] Received ${photos.length} photos, itemIds:`, photos.map(p => p.itemId));
        const tablePhotoCount = photos.filter(p => p.itemId?.startsWith('table_')).length;
        console.log(`[SUBMIT] Table photos detected: ${tablePhotoCount}`);

        // Validate required fields
        if (!auditData || !auditData.siteName) {
            return NextResponse.json({ error: 'Missing required audit data (siteName)' }, { status: 400 });
        }
        if (!checklist || !checklist.sections) {
            return NextResponse.json({ error: 'Missing checklist data' }, { status: 400 });
        }

        const clientName = auditData.clientName || auditData.siteName;

        console.log(`[AUDIT:${auditId}] Starting audit submission for ${auditData.siteName}`);

        // Check if Drive resources were pre-created at audit start
        const driveResources = auditData.driveResources;
        let folders;

        if (driveResources?.auditFolderId) {
            console.log(`[AUDIT:${auditId}] Using pre-created Drive resources (fast path)`);
            folders = {
                auditFolderId: driveResources.auditFolderId,
                photosFolderId: driveResources.photosFolderId,
            };
        } else {
            // Step 1: Create folder structure (fallback if not pre-created)
            console.log(`[AUDIT:${auditId}] Creating folder structure (fallback)...`);
            folders = await createAuditFolderStructure(accessToken, {
                clientName,
                siteName: auditData.siteName,
                auditDate: auditData.auditDate || new Date().toISOString(),
            });
        }

        // Step 2: Use pre-created section folders or create new ones as fallback
        const sectionTitles = checklist.sections.map(s => s.section_title || s.sectionTitle);
        let sectionFolders;

        if (driveResources?.sectionFolders && Object.keys(driveResources.sectionFolders).length > 0) {
            sectionFolders = driveResources.sectionFolders;
            console.log(`[AUDIT:${auditId}] Using pre-created section folders (fast path)`);
        } else {
            console.log(`[AUDIT:${auditId}] Creating section folders (fallback)...`);
            sectionFolders = await createSectionPhotoFolders(
                accessToken,
                folders.photosFolderId,
                sectionTitles
            );
        }

        // Step 2b: Create table photo folders by detecting table photos from photos array
        // Table photos have itemId like "table_table_1767520826585_header_0"
        const tableFolders = {};
        const tableNames = new Set();

        console.log(`[AUDIT:${auditId}] Detecting table photos from ${photos.length} total photos...`);

        // Find unique table names from photos
        for (const photo of photos) {
            const isTablePhoto = photo.itemId?.includes('_header_') && photo.itemId?.startsWith('table_');

            if (isTablePhoto) {
                // Extract table_id from itemId: "table_[TABLE_ID]_header_N"
                // TABLE_ID can be like "table_1767520826585" so result is "table_table_1767520826585_header_0"
                // We need to extract everything before "_header_"
                const headerIndex = photo.itemId.indexOf('_header_');
                const tableIdPart = photo.itemId.substring(6, headerIndex); // Skip "table_" prefix
                console.log(`[AUDIT:${auditId}] Table photo ${photo.filename}: tableIdPart="${tableIdPart}"`);

                // Find the table by matching table_id
                for (const section of checklist.sections) {
                    const tables = section.tables || [];
                    for (const table of tables) {
                        // table.table_id could be "table_1767520826585"
                        if (table.table_id === tableIdPart || `table_${table.table_id}` === tableIdPart || table.table_id === `table_${tableIdPart}`) {
                            const tableName = table.columns?.[1] || 'Electrical Readings';
                            const folderName = `${tableName} READINGS`;
                            tableNames.add(folderName);
                            console.log(`[AUDIT:${auditId}] Matched table ${table.table_id} -> folder: ${folderName}`);
                            break;
                        }
                    }
                }
            }
        }

        console.log(`[AUDIT:${auditId}] Table folders to create:`, Array.from(tableNames));

        // Create folders for each table
        for (const tableName of tableNames) {
            try {
                const folderId = await createSectionPhotoFolders(accessToken, folders.photosFolderId, [tableName]);
                tableFolders[tableName] = folderId[tableName];
                console.log(`[AUDIT:${auditId}] Created table folder: ${tableName}`);
            } catch (err) {
                console.warn(`[AUDIT:${auditId}] Could not create table folder ${tableName}:`, err.message);
            }
        }


        // Step 3: Process photos - handle both new uploads and already-uploaded photos
        console.log(`[AUDIT:${auditId}] Processing ${photos.length} photos...`);
        const uploadedPhotos = [];

        for (const photo of photos) {
            try {
                let targetFolderId = folders.photosFolderId;

                // Check if this is a table photo (itemId starts with "table_")
                if (photo.itemId?.startsWith('table_') && photo.itemId?.includes('_header_')) {
                    // Extract table_id from itemId
                    const headerIndex = photo.itemId.indexOf('_header_');
                    const tableIdPart = photo.itemId.substring(6, headerIndex); // Skip "table_" prefix

                    // Find the table by matching table_id
                    for (const section of checklist.sections) {
                        const tables = section.tables || [];
                        for (const table of tables) {
                            if (table.table_id === tableIdPart || `table_${table.table_id}` === tableIdPart || table.table_id === `table_${tableIdPart}`) {
                                const tableName = table.columns?.[1] || 'Electrical Readings';
                                const folderName = `${tableName} READINGS`;
                                targetFolderId = tableFolders[folderName] || folders.photosFolderId;
                                break;
                            }
                        }
                    }
                } else {
                    // Regular checklist photo - find which section it belongs to
                    for (const section of checklist.sections) {
                        let found = false;

                        // Check subsections structure
                        if (section.subsections && section.subsections.length > 0) {
                            for (const sub of section.subsections) {
                                if ((sub.items || []).some(item =>
                                    (item.sl_no === photo.itemId || item.slNo === photo.itemId || item.item_id === photo.itemId)
                                )) {
                                    const sectionTitle = section.section_title || section.sectionTitle;
                                    targetFolderId = sectionFolders[sectionTitle] || folders.photosFolderId;
                                    found = true;
                                    break;
                                }
                            }
                        }

                        // Check old items structure
                        if (!found && section.items) {
                            if (section.items.some(item =>
                                (item.item_id === photo.itemId || item.itemId === photo.itemId || item.sl_no === photo.itemId || item.slNo === photo.itemId)
                            )) {
                                const sectionTitle = section.section_title || section.sectionTitle;
                                targetFolderId = sectionFolders[sectionTitle] || folders.photosFolderId;
                            }
                        }

                        if (found) break;
                    }
                }

                // Check if photo was already uploaded via background upload
                if (photo.alreadyUploaded && photo.driveFileId) {
                    // Photos are now named with section prefix (e.g., "Critical DB_1.jpg")
                    // No need to move to section folders - saves significant time!
                    console.log(`[AUDIT:${auditId}] Using already-uploaded photo: ${photo.filename} (${photo.driveFileId})`);

                    uploadedPhotos.push({
                        itemId: photo.itemId,
                        filename: photo.filename,
                        fileId: photo.driveFileId,
                        webViewLink: photo.driveLink || `https://drive.google.com/file/d/${photo.driveFileId}/view`,
                    });
                } else if (photo.base64) {
                    // New photo - upload to Drive
                    const buffer = Buffer.from(photo.base64, 'base64');
                    const uploaded = await uploadPhoto(
                        accessToken,
                        targetFolderId,
                        photo.filename,
                        buffer,
                        photo.mimeType || 'image/jpeg'
                    );

                    uploadedPhotos.push({
                        itemId: photo.itemId,
                        filename: photo.filename,
                        fileId: uploaded.id,
                        webViewLink: uploaded.webViewLink,
                    });
                } else {
                    console.warn(`[AUDIT:${auditId}] Photo ${photo.filename} has no base64 and no driveFileId - skipping`);
                }
            } catch (photoErr) {
                console.error(`[AUDIT:${auditId}] Failed to process photo:`, photoErr.message);
            }
        }

        console.log(`[AUDIT:${auditId}] Successfully processed ${uploadedPhotos.length} of ${photos.length} photos`);

        // Step 4: Create Google Sheet (one sheet per section)
        console.log(`[AUDIT:${auditId}] Creating Google Sheet...`);

        // Use responses from request body (includes table values)
        // Also merge with any responses embedded in checklist items
        const responses = { ...(req_responses || {}) };
        for (const section of checklist.sections) {
            // Handle subsections structure
            if (section.subsections) {
                for (const sub of section.subsections) {
                    for (const item of sub.items || []) {
                        const itemId = item.sl_no || item.slNo || item.item_id;
                        if (item.response && !responses[itemId]) {
                            responses[itemId] = { response: item.response, remarks: item.remarks };
                        }
                    }
                }
            } else {
                // Handle old items structure
                for (const item of section.items || []) {
                    const itemId = item.sl_no || item.slNo || item.item_id;
                    if (item.response && !responses[itemId]) {
                        responses[itemId] = { response: item.response, remarks: item.remarks };
                    }
                }
            }
        }

        const sheetTitle = `${auditData.siteName}_Audit_${new Date().toISOString().split('T')[0]}`;
        const sheet = await createChecklistSpreadsheet(accessToken, sheetTitle, auditData, checklist.sections, responses);
        await moveFileToFolder(accessToken, sheet.spreadsheetId, folders.auditFolderId);

        // Step 5: Create Google Slides with photos
        console.log(`[AUDIT:${auditId}] Creating Google Slides with ${uploadedPhotos.length} photos...`);
        console.log(`[AUDIT:${auditId}] auditData.sectionFindings:`, JSON.stringify(auditData.sectionFindings || {}));

        const sectionsForSlides = checklist.sections.map(section => ({
            section_id: section.section_id || section.sectionId,
            sectionId: section.section_id || section.sectionId,
            sectionTitle: section.section_title || section.sectionTitle,
            section_title: section.section_title || section.sectionTitle,
            items: (section.items || []).map(item => {
                const itemId = item.sl_no || item.slNo || item.item_id;
                const resp = responses[itemId] || {};
                return {
                    slNo: itemId,
                    sl_no: itemId,
                    item_id: itemId,
                    checkingCriteria: item.checking_criteria || item.checkingCriteria,
                    response: item.response || resp.response,
                    remarks: item.remarks || resp.remarks,
                };
            }),
            subsections: (section.subsections || []).map(sub => ({
                subsection_title: sub.subsection_title || sub.subsectionTitle,
                items: (sub.items || []).map(item => {
                    const itemId = item.sl_no || item.slNo || item.item_id;
                    const resp = responses[itemId] || {};
                    return {
                        sl_no: itemId,
                        slNo: itemId,
                        item_id: itemId,
                        remarks: item.remarks || resp.remarks,
                    };
                }),
            })),
        }));

        console.log(`[AUDIT:${auditId}] sectionsForSlides count: ${sectionsForSlides.length}`);

        const reportTitle = `${auditData.siteName}_Report_${new Date().toISOString().split('T')[0]}`;
        const presentation = await createAuditPresentation(accessToken, reportTitle, auditData, sectionsForSlides, uploadedPhotos);
        await moveFileToFolder(accessToken, presentation.presentationId, folders.auditFolderId);

        const duration = Date.now() - startTime;
        console.log(`[AUDIT:${auditId}] Completed in ${duration}ms`);

        return NextResponse.json({
            success: true,
            auditId,
            duration,
            folders: { auditFolderLink: folders.auditFolderLink },
            sheet: { id: sheet.spreadsheetId, url: sheet.spreadsheetUrl },
            presentation: { id: presentation.presentationId, url: presentation.presentationUrl },
            photos: { uploaded: uploadedPhotos.length, total: photos.length },
        });
    } catch (err) {
        console.error(`[AUDIT:${auditId}] Error:`, err);
        return NextResponse.json({
            error: 'Failed to submit audit',
            message: err.message,
            auditId,
        }, { status: 500 });
    }
}
