/**
 * Audit Init API
 * 
 * Creates Drive folder structure and Google Sheet at audit start.
 * Photos upload to the Photos folder during audit (named with section prefix).
 * PPT is created at submit with proper formatting.
 */

import { NextResponse } from 'next/server';
import { createAuditFolderStructure } from '@/lib/google/drive';
import { createChecklistSpreadsheet } from '@/lib/google/sheets';

export async function POST(request) {
    const initId = Math.random().toString(36).substring(2, 10);
    console.log(`[INIT:${initId}] Starting audit initialization...`);

    try {
        // Verify authorization
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const accessToken = authHeader.split(' ')[1];

        // Parse request body
        const { auditId, siteName, location, auditorName, checklistTitle, sections } = await request.json();

        if (!auditId || !siteName) {
            return NextResponse.json({ error: 'Missing auditId or siteName' }, { status: 400 });
        }

        console.log(`[INIT:${initId}] Initializing for audit: ${siteName}`);

        // Get client name from auth
        const authData = request.headers.get('X-Client-Name') || siteName;
        const clientName = authData;

        // Step 1: Create folder structure
        console.log(`[INIT:${initId}] Creating folder structure...`);
        const folders = await createAuditFolderStructure(accessToken, {
            clientName,
            siteName,
            auditDate: new Date().toISOString(),
        });

        // Note: Section folders are no longer created at init
        // Photos are now named with section prefix (e.g., "Critical DB_1.jpg")
        // This speeds up both init and submit

        // Step 2: Create Google Sheet
        console.log(`[INIT:${initId}] Creating Google Sheet...`);
        const sheet = await createChecklistSpreadsheet(
            accessToken,
            `${siteName} - Audit Report`,
            {
                siteName,
                clientName,
                auditorName: auditorName || 'Unknown',
                location: location || '',
                auditDate: new Date().toISOString(),
            },
            sections || [],
            {} // Empty responses at init
        );

        // Note: PPT is created at submit with proper formatting and photos
        // Creating an empty one here would just create a duplicate

        console.log(`[INIT:${initId}] Initialization complete!`);

        return NextResponse.json({
            success: true,
            driveResources: {
                auditFolderId: folders.auditFolderId,
                photosFolderId: folders.photosFolderId,
                sheetId: sheet.spreadsheetId,
                sheetLink: sheet.spreadsheetUrl,
            }
        });

    } catch (error) {
        console.error(`[INIT:${initId}] Error:`, error);
        return NextResponse.json({
            error: error.message,
            // Return partial success if some resources were created
            partialSuccess: false
        }, { status: 500 });
    }
}
