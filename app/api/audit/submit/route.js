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

        // Validate required fields
        if (!auditData || !auditData.siteName) {
            return NextResponse.json({ error: 'Missing required audit data (siteName)' }, { status: 400 });
        }
        if (!checklist || !checklist.sections) {
            return NextResponse.json({ error: 'Missing checklist data' }, { status: 400 });
        }

        const clientName = auditData.clientName || auditData.siteName;

        console.log(`[AUDIT:${auditId}] Starting audit submission for ${auditData.siteName}`);

        // Step 1: Create folder structure
        console.log(`[AUDIT:${auditId}] Creating folder structure...`);
        const folders = await createAuditFolderStructure(accessToken, {
            clientName,
            siteName: auditData.siteName,
            auditDate: auditData.auditDate || new Date().toISOString(),
        });

        // Step 2: Create section photo folders
        const sectionTitles = checklist.sections.map(s => s.section_title || s.sectionTitle);
        const sectionFolders = await createSectionPhotoFolders(
            accessToken,
            folders.photosFolderId,
            sectionTitles
        );

        // Step 3: Process photos - handle both new uploads and already-uploaded photos
        console.log(`[AUDIT:${auditId}] Processing ${photos.length} photos...`);
        const uploadedPhotos = [];

        for (const photo of photos) {
            try {
                let targetFolderId = folders.photosFolderId;

                // Find which section the photo belongs to
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

                // Check if photo was already uploaded via background upload
                if (photo.alreadyUploaded && photo.driveFileId) {
                    console.log(`[AUDIT:${auditId}] Photo ${photo.filename} already in Drive (${photo.driveFileId}), moving to audit folder...`);

                    // Move the existing file to the correct audit folder
                    try {
                        await moveFileToFolder(accessToken, photo.driveFileId, targetFolderId);
                        console.log(`[AUDIT:${auditId}] Moved ${photo.filename} to audit folder`);
                    } catch (moveErr) {
                        console.warn(`[AUDIT:${auditId}] Could not move file, may already be in place:`, moveErr.message);
                    }

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
        const sectionsForSlides = checklist.sections.map(section => ({
            sectionTitle: section.section_title || section.sectionTitle,
            items: (section.items || []).map(item => ({
                slNo: item.sl_no || item.slNo,
                checkingCriteria: item.checking_criteria || item.checkingCriteria,
                response: item.response,
                remarks: item.remarks,
            })),
            subsections: (section.subsections || []).map(sub => ({
                items: (sub.items || []).map(item => ({
                    sl_no: item.sl_no || item.slNo,
                    item_id: item.item_id || item.itemId,
                    remarks: item.remarks,
                })),
            })),
        }));

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
