/**
 * Audit Submit API Route
 * POST /api/audit/submit
 * 
 * Submits audit and generates Google Drive folder, Sheet, and Slides
 */

import { NextResponse } from 'next/server';
import { createAuditFolderStructure, uploadPhoto, moveFileToFolder } from '@/lib/google/drive';
import { createChecklistSpreadsheet, addPhotoLinksToSheet } from '@/lib/google/sheets';
import { createAuditPresentation } from '@/lib/google/slides';

export const maxDuration = 120; // Increased to 120s for handling many photos + sheet + slides creation

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
        const { auditData, checklist, photos: rawPhotos = [], responses: req_responses = {} } = await request.json();

        // DEFENSIVE: Filter out null or invalid photos (safety net for sync failures)
        const photos = (rawPhotos || []).filter(p => p !== null && p !== undefined && p.itemId);
        const skippedCount = (rawPhotos || []).length - photos.length;
        if (skippedCount > 0) {
            console.warn(`[SUBMIT] Filtered out ${skippedCount} invalid/null photos from ${rawPhotos.length} total`);
        }

        // EARLY DEBUG: Log photos array immediately
        console.log(`[SUBMIT] Processing ${photos.length} valid photos, itemIds:`, photos.map(p => p.itemId));
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

        // Photos are now named with section prefixes (e.g., "Critical DB_1.jpg")
        // and uploaded directly to the Photos folder - no need for subfolders
        console.log(`[AUDIT:${auditId}] Photos use section-prefixed names, skipping subfolder creation`);


        // Step 3: Process photos - handle both new uploads and already-uploaded photos
        // Photos are named with section prefixes, so all go to main Photos folder
        console.log(`[AUDIT:${auditId}] Processing ${photos.length} photos...`);
        const uploadedPhotos = [];

        for (const photo of photos) {
            try {
                // Check if photo was already uploaded via background upload
                if (photo.alreadyUploaded && photo.driveFileId) {
                    console.log(`[AUDIT:${auditId}] Using already-uploaded photo: ${photo.filename} (${photo.driveFileId})`);

                    uploadedPhotos.push({
                        itemId: photo.itemId,
                        filename: photo.filename,
                        fileId: photo.driveFileId,
                        webViewLink: photo.driveLink || `https://drive.google.com/file/d/${photo.driveFileId}/view`,
                    });
                } else if (photo.base64) {
                    // Fallback: upload via server (rare case)
                    console.log(`[AUDIT:${auditId}] Uploading ${photo.filename} via server fallback...`);
                    const buffer = Buffer.from(photo.base64, 'base64');
                    const uploaded = await uploadPhoto(
                        accessToken,
                        folders.photosFolderId,
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
                console.error(`[AUDIT:${auditId}] Failed to process photo ${photo.filename}:`, photoErr.message);
            }
        }

        const failedPhotoCount = photos.length - uploadedPhotos.length;
        console.log(`[AUDIT:${auditId}] Successfully processed ${uploadedPhotos.length} of ${photos.length} photos`);
        if (failedPhotoCount > 0) {
            console.warn(`[AUDIT:${auditId}] WARNING: ${failedPhotoCount} photos failed to process!`);
        }

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

        // Step 5: Create Google Slides with photos (non-blocking - doesn't fail audit if PPT fails)
        let presentation = null;
        let pptError = null;

        try {
            const reportTitle = `${auditData.siteName}_Report_${new Date().toISOString().split('T')[0]}`;
            console.log(`[AUDIT:${auditId}] Starting PPT creation with ${uploadedPhotos.length} photos...`);
            const pptStartTime = Date.now();

            presentation = await createAuditPresentation(accessToken, reportTitle, auditData, sectionsForSlides, uploadedPhotos);
            await moveFileToFolder(accessToken, presentation.presentationId, folders.auditFolderId);

            console.log(`[AUDIT:${auditId}] PPT created in ${Date.now() - pptStartTime}ms`);
        } catch (pptErr) {
            console.error(`[AUDIT:${auditId}] PPT creation failed:`, pptErr.message);
            pptError = pptErr.message;
            // Continue - don't fail the entire audit just because PPT failed
        }

        const duration = Date.now() - startTime;
        console.log(`[AUDIT:${auditId}] Completed in ${duration}ms`);

        return NextResponse.json({
            success: true,
            auditId,
            duration,
            folders: { auditFolderLink: folders.auditFolderLink },
            sheet: { id: sheet.spreadsheetId, url: sheet.spreadsheetUrl },
            presentation: presentation
                ? { id: presentation.presentationId, url: presentation.presentationUrl }
                : { error: pptError || 'PPT generation skipped' },
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
