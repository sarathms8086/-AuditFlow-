/**
 * Audit Routes
 * 
 * Handles audit submission and report generation:
 * - POST /api/audit/submit - Submit completed audit
 * - POST /api/audit/photos - Upload photos (batch)
 */

import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { createAuditFolderStructure, createSectionPhotoFolders, uploadPhoto, moveFileToFolder } from '../services/google/drive.js';
import { createChecklistSpreadsheet, addPhotoLinksToSheet } from '../services/google/sheets.js';
import { createAuditPresentation } from '../services/google/slides.js';

const router = Router();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max per file
        files: 50, // Max 50 files per request
    },
});

/**
 * Auth middleware - Extract access token from Authorization header
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No access token provided' });
    }
    req.accessToken = authHeader.split(' ')[1];
    next();
}

/**
 * POST /api/audit/submit
 * 
 * Submit a completed audit and generate:
 * 1. Google Drive folder structure
 * 2. Google Sheet checklist
 * 3. Google Slides report
 * 
 * Request body:
 * {
 *   auditData: { siteName, clientName, projectCode, location, auditDate, auditorName, projectManager },
 *   checklist: { checklistId, title, sections: [{ sectionTitle, items: [...] }] },
 *   photos: [{ itemId, filename, base64, mimeType }]
 * }
 */
router.post('/submit', requireAuth, async (req, res) => {
    const startTime = Date.now();
    const auditId = uuidv4();

    try {
        const { auditData, checklist, photos = [] } = req.body;

        // Validate required fields
        if (!auditData || !auditData.siteName) {
            return res.status(400).json({ error: 'Missing required audit data (siteName)' });
        }
        if (!checklist || !checklist.sections) {
            return res.status(400).json({ error: 'Missing checklist data' });
        }

        // Default clientName to siteName if not provided
        const clientName = auditData.clientName || auditData.siteName;

        console.log(`[AUDIT:${auditId}] Starting audit submission for ${auditData.siteName}`);

        // Step 1: Create folder structure in Google Drive
        console.log(`[AUDIT:${auditId}] Creating folder structure...`);
        const folders = await createAuditFolderStructure(req.accessToken, {
            clientName: clientName,
            siteName: auditData.siteName,
            auditDate: auditData.auditDate || new Date().toISOString(),
        });

        // Step 2: Create section photo folders
        const sectionTitles = checklist.sections.map(s => s.section_title || s.sectionTitle);
        const sectionFolders = await createSectionPhotoFolders(
            req.accessToken,
            folders.photosFolderId,
            sectionTitles
        );

        // Step 3: Upload photos
        console.log(`[AUDIT:${auditId}] Uploading ${photos.length} photos...`);
        const uploadedPhotos = [];
        for (const photo of photos) {
            try {
                // Find the section for this photo
                let targetFolderId = folders.photosFolderId; // Default
                for (const section of checklist.sections) {
                    const items = section.items || [];
                    if (items.some(item => item.item_id === photo.itemId || item.itemId === photo.itemId)) {
                        const sectionTitle = section.section_title || section.sectionTitle;
                        targetFolderId = sectionFolders[sectionTitle] || folders.photosFolderId;
                        break;
                    }
                }

                // Convert base64 to buffer
                const buffer = Buffer.from(photo.base64, 'base64');

                const uploaded = await uploadPhoto(
                    req.accessToken,
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
                    webContentLink: uploaded.webContentLink,
                });
            } catch (photoErr) {
                console.error(`[AUDIT:${auditId}] Failed to upload photo ${photo.filename}:`, photoErr.message);
            }
        }

        // Step 4: Create Google Sheet checklist
        console.log(`[AUDIT:${auditId}] Creating Google Sheet...`);

        // Flatten checklist items for sheet population
        const checklistItems = [];
        for (const section of checklist.sections) {
            const sectionTitle = section.section_title || section.sectionTitle;
            for (const item of section.items || []) {
                checklistItems.push({
                    sectionTitle,
                    slNo: item.sl_no || item.slNo,
                    checkingCriteria: item.checking_criteria || item.checkingCriteria,
                    response: item.response,
                    remarks: item.remarks,
                });
            }
        }

        const sheetTitle = `${auditData.siteName}_Audit_Checklist_${new Date().toISOString().split('T')[0]}`;
        const sheet = await createChecklistSpreadsheet(
            req.accessToken,
            sheetTitle,
            auditData,
            checklistItems
        );

        // Move sheet to audit folder
        await moveFileToFolder(req.accessToken, sheet.spreadsheetId, folders.auditFolderId);

        // Add photo links to sheet
        if (uploadedPhotos.length > 0) {
            const photoLinks = uploadedPhotos.map((photo, index) => ({
                row: 8 + checklistItems.findIndex(item =>
                    (item.slNo === photo.itemId) ||
                    checklistItems.some((ci, idx) => ci.slNo === photo.itemId)
                ),
                url: photo.webViewLink,
                filename: photo.filename,
            })).filter(link => link.row >= 8);

            if (photoLinks.length > 0) {
                await addPhotoLinksToSheet(req.accessToken, sheet.spreadsheetId, photoLinks);
            }
        }

        // Step 5: Create Google Slides presentation
        console.log(`[AUDIT:${auditId}] Creating Google Slides report...`);

        // Prepare sections for slides
        const sectionsForSlides = checklist.sections.map(section => ({
            sectionTitle: section.section_title || section.sectionTitle,
            items: (section.items || []).map(item => ({
                slNo: item.sl_no || item.slNo,
                checkingCriteria: item.checking_criteria || item.checkingCriteria,
                response: item.response,
                remarks: item.remarks,
            })),
        }));

        const reportTitle = `${auditData.siteName}_Audit_Report_${new Date().toISOString().split('T')[0]}`;
        const presentation = await createAuditPresentation(
            req.accessToken,
            reportTitle,
            auditData,
            sectionsForSlides
        );

        // Move presentation to audit folder
        await moveFileToFolder(req.accessToken, presentation.presentationId, folders.auditFolderId);

        const duration = Date.now() - startTime;
        console.log(`[AUDIT:${auditId}] Completed in ${duration}ms`);

        // Return success with links
        res.json({
            success: true,
            auditId,
            duration,
            folders: {
                auditFolderLink: folders.auditFolderLink,
            },
            sheet: {
                id: sheet.spreadsheetId,
                url: sheet.spreadsheetUrl,
            },
            presentation: {
                id: presentation.presentationId,
                url: presentation.presentationUrl,
            },
            photos: {
                uploaded: uploadedPhotos.length,
                total: photos.length,
            },
        });
    } catch (err) {
        console.error(`[AUDIT:${auditId}] Error:`, err);
        res.status(500).json({
            error: 'Failed to submit audit',
            message: err.message,
            auditId,
        });
    }
});

/**
 * POST /api/audit/photos
 * 
 * Alternative endpoint for multipart photo uploads
 * Used for direct file uploads instead of base64
 */
router.post('/photos', requireAuth, upload.array('photos', 50), async (req, res) => {
    try {
        const { folderId, itemIds } = req.body;

        if (!folderId) {
            return res.status(400).json({ error: 'Folder ID required' });
        }

        const itemIdList = itemIds ? JSON.parse(itemIds) : [];
        const uploadedPhotos = [];

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const itemId = itemIdList[i] || null;

            const uploaded = await uploadPhoto(
                req.accessToken,
                folderId,
                file.originalname,
                file.buffer,
                file.mimetype
            );

            uploadedPhotos.push({
                itemId,
                filename: file.originalname,
                fileId: uploaded.id,
                webViewLink: uploaded.webViewLink,
            });
        }

        res.json({
            success: true,
            uploaded: uploadedPhotos,
        });
    } catch (err) {
        console.error('[PHOTOS] Upload error:', err);
        res.status(500).json({
            error: 'Failed to upload photos',
            message: err.message,
        });
    }
});

export default router;
