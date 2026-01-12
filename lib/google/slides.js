/**
 * Google Slides API utilities
 * Creates presentation with photos from audit
 */

import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth';

/**
 * Create audit presentation with photos
 * Each photo gets its own slide with:
 * - Section title (orange, centered at top)
 * - Photo (centered in middle)
 * - Remarks (at bottom in a box)
 */
export async function createAuditPresentation(accessToken, title, auditData, sections, uploadedPhotos = []) {
    const auth = getAuthenticatedClient(accessToken);
    const slides = google.slides({ version: 'v1', auth });

    // Create presentation
    const presentation = await slides.presentations.create({
        resource: { title },
    });

    const presentationId = presentation.data.presentationId;

    // Build slide requests
    const requests = [];

    // Delete the default blank slide
    const defaultSlideId = presentation.data.slides[0].objectId;
    requests.push({ deleteObject: { objectId: defaultSlideId } });

    // Create title slide
    const titleSlideId = 'title_slide';
    requests.push({
        createSlide: {
            objectId: titleSlideId,
            slideLayoutReference: { predefinedLayout: 'BLANK' },
        },
    });

    // Add title text box
    requests.push({
        createShape: {
            objectId: `${titleSlideId}_title_box`,
            shapeType: 'TEXT_BOX',
            elementProperties: {
                pageObjectId: titleSlideId,
                size: { width: { magnitude: 600, unit: 'PT' }, height: { magnitude: 100, unit: 'PT' } },
                transform: { scaleX: 1, scaleY: 1, translateX: 58, translateY: 150, unit: 'PT' },
            },
        },
    });

    requests.push({
        insertText: {
            objectId: `${titleSlideId}_title_box`,
            text: `ELECTRICAL SITE AUDIT REPORT\n${auditData.siteName || 'Audit Report'}`,
        },
    });

    // Style title text
    requests.push({
        updateTextStyle: {
            objectId: `${titleSlideId}_title_box`,
            style: {
                fontSize: { magnitude: 36, unit: 'PT' },
                fontFamily: 'Arial',
                bold: true,
                foregroundColor: { opaqueColor: { rgbColor: { red: 0.85, green: 0.35, blue: 0.0 } } },
            },
            textRange: { type: 'ALL' },
            fields: 'fontSize,fontFamily,bold,foregroundColor',
        },
    });

    requests.push({
        updateParagraphStyle: {
            objectId: `${titleSlideId}_title_box`,
            style: { alignment: 'CENTER' },
            textRange: { type: 'ALL' },
            fields: 'alignment',
        },
    });

    // Add audit info text box
    requests.push({
        createShape: {
            objectId: `${titleSlideId}_info_box`,
            shapeType: 'TEXT_BOX',
            elementProperties: {
                pageObjectId: titleSlideId,
                size: { width: { magnitude: 400, unit: 'PT' }, height: { magnitude: 150, unit: 'PT' } },
                transform: { scaleX: 1, scaleY: 1, translateX: 158, translateY: 280, unit: 'PT' },
            },
        },
    });

    const infoText = [
        `Date: ${auditData.auditDate || new Date().toLocaleDateString()}`,
        `Checked By: ${auditData.auditorName || 'Auditor'}`,
        `Site: ${auditData.siteName || ''}`,
    ].join('\n');

    requests.push({
        insertText: {
            objectId: `${titleSlideId}_info_box`,
            text: infoText,
        },
    });

    requests.push({
        updateTextStyle: {
            objectId: `${titleSlideId}_info_box`,
            style: { fontSize: { magnitude: 18, unit: 'PT' }, fontFamily: 'Arial' },
            textRange: { type: 'ALL' },
            fields: 'fontSize,fontFamily',
        },
    });

    requests.push({
        updateParagraphStyle: {
            objectId: `${titleSlideId}_info_box`,
            style: { alignment: 'CENTER' },
            textRange: { type: 'ALL' },
            fields: 'alignment',
        },
    });

    // Group photos by itemId to create one slide per item
    const photosByItem = {};
    for (const photo of uploadedPhotos) {
        if (!photosByItem[photo.itemId]) {
            photosByItem[photo.itemId] = [];
        }
        photosByItem[photo.itemId].push(photo);
    }

    // Create a slide for each checklist item with photos
    let slideIndex = 0;
    for (const [itemId, itemPhotos] of Object.entries(photosByItem)) {
        const photoSlideId = `photo_slide_${slideIndex++}`;

        // Find which section this item belongs to and get remarks
        let sectionTitle = 'Audit Photo';
        let itemRemarks = '';

        for (const section of sections) {
            const items = section.items || [];
            const subsectionItems = (section.subsections || []).flatMap(sub => sub.items || []);
            const allItems = [...items, ...subsectionItems];

            for (const item of allItems) {
                const id = item.sl_no || item.slNo || item.item_id || item.itemId;
                if (id === itemId) {
                    sectionTitle = section.sectionTitle || section.section_title || 'Audit Photo';
                    itemRemarks = item.remarks || '';
                    break;
                }
            }
        }

        // Create blank slide
        requests.push({
            createSlide: {
                objectId: photoSlideId,
                slideLayoutReference: { predefinedLayout: 'BLANK' },
            },
        });

        // Add section title at top (orange color)
        requests.push({
            createShape: {
                objectId: `${photoSlideId}_title`,
                shapeType: 'TEXT_BOX',
                elementProperties: {
                    pageObjectId: photoSlideId,
                    size: { width: { magnitude: 600, unit: 'PT' }, height: { magnitude: 50, unit: 'PT' } },
                    transform: { scaleX: 1, scaleY: 1, translateX: 58, translateY: 20, unit: 'PT' },
                },
            },
        });

        requests.push({
            insertText: {
                objectId: `${photoSlideId}_title`,
                text: sectionTitle,
            },
        });

        // Style section title - orange, bold, centered
        requests.push({
            updateTextStyle: {
                objectId: `${photoSlideId}_title`,
                style: {
                    fontSize: { magnitude: 28, unit: 'PT' },
                    fontFamily: 'Arial',
                    bold: true,
                    italic: true,
                    foregroundColor: { opaqueColor: { rgbColor: { red: 0.85, green: 0.45, blue: 0.0 } } },
                },
                textRange: { type: 'ALL' },
                fields: 'fontSize,fontFamily,bold,italic,foregroundColor',
            },
        });

        requests.push({
            updateParagraphStyle: {
                objectId: `${photoSlideId}_title`,
                style: { alignment: 'CENTER' },
                textRange: { type: 'ALL' },
                fields: 'alignment',
            },
        });

        // Dynamic photo layouts based on count
        const photoCount = Math.min(itemPhotos.length, 3); // Max 3 photos

        // Layout configurations for 1, 2, or 3 photos
        const layouts = {
            1: [
                // Single centered large photo
                { width: 400, height: 280, x: 160, y: 80 }
            ],
            2: [
                // Two side-by-side photos
                { width: 300, height: 260, x: 33, y: 80 },
                { width: 300, height: 260, x: 383, y: 80 }
            ],
            3: [
                // Three photos in a row
                { width: 210, height: 250, x: 33, y: 80 },
                { width: 210, height: 250, x: 258, y: 80 },
                { width: 210, height: 250, x: 483, y: 80 }
            ]
        };

        const positions = layouts[photoCount] || layouts[1];

        // Add photo images
        for (let i = 0; i < photoCount; i++) {
            const photo = itemPhotos[i];
            const pos = positions[i];

            if (photo.fileId) {
                const driveImageUrl = `https://lh3.googleusercontent.com/d/${photo.fileId}`;

                requests.push({
                    createImage: {
                        objectId: `${photoSlideId}_image_${i}`,
                        url: driveImageUrl,
                        elementProperties: {
                            pageObjectId: photoSlideId,
                            size: {
                                width: { magnitude: pos.width, unit: 'PT' },
                                height: { magnitude: pos.height, unit: 'PT' }
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: pos.x,
                                translateY: pos.y,
                                unit: 'PT'
                            },
                        },
                    },
                });
            }
        }

        // Add remarks box at bottom with border
        requests.push({
            createShape: {
                objectId: `${photoSlideId}_remarks`,
                shapeType: 'TEXT_BOX',
                elementProperties: {
                    pageObjectId: photoSlideId,
                    size: { width: { magnitude: 650, unit: 'PT' }, height: { magnitude: 60, unit: 'PT' } },
                    transform: { scaleX: 1, scaleY: 1, translateX: 33, translateY: 345, unit: 'PT' },
                },
            },
        });

        requests.push({
            insertText: {
                objectId: `${photoSlideId}_remarks`,
                text: `REMARK MENTIONED: ${itemRemarks || 'No remarks'}`,
            },
        });

        requests.push({
            updateTextStyle: {
                objectId: `${photoSlideId}_remarks`,
                style: {
                    fontSize: { magnitude: 14, unit: 'PT' },
                    fontFamily: 'Arial',
                },
                textRange: { type: 'ALL' },
                fields: 'fontSize,fontFamily',
            },
        });

        // Add border to remarks box
        requests.push({
            updateShapeProperties: {
                objectId: `${photoSlideId}_remarks`,
                shapeProperties: {
                    outline: {
                        outlineFill: { solidFill: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } } },
                        weight: { magnitude: 1, unit: 'PT' },
                    },
                },
                fields: 'outline',
            },
        });

        // Add teal/green bar at the very bottom
        requests.push({
            createShape: {
                objectId: `${photoSlideId}_bar`,
                shapeType: 'RECTANGLE',
                elementProperties: {
                    pageObjectId: photoSlideId,
                    size: { width: { magnitude: 720, unit: 'PT' }, height: { magnitude: 8, unit: 'PT' } },
                    transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 532, unit: 'PT' },
                },
            },
        });

        requests.push({
            updateShapeProperties: {
                objectId: `${photoSlideId}_bar`,
                shapeProperties: {
                    shapeBackgroundFill: {
                        solidFill: { color: { rgbColor: { red: 0.0, green: 0.6, blue: 0.55 } } },
                    },
                    outline: { outlineFill: { solidFill: { color: { rgbColor: { red: 0.0, green: 0.6, blue: 0.55 } } } } },
                },
                fields: 'shapeBackgroundFill,outline',
            },
        });
    }

    // If no photos, create a summary slide
    if (uploadedPhotos.length === 0) {
        const summarySlideId = 'summary_slide';
        requests.push({
            createSlide: {
                objectId: summarySlideId,
                slideLayoutReference: { predefinedLayout: 'BLANK' },
            },
        });

        requests.push({
            createShape: {
                objectId: `${summarySlideId}_text`,
                shapeType: 'TEXT_BOX',
                elementProperties: {
                    pageObjectId: summarySlideId,
                    size: { width: { magnitude: 400, unit: 'PT' }, height: { magnitude: 100, unit: 'PT' } },
                    transform: { scaleX: 1, scaleY: 1, translateX: 158, translateY: 200, unit: 'PT' },
                },
            },
        });

        requests.push({
            insertText: {
                objectId: `${summarySlideId}_text`,
                text: 'No photos captured during this audit.',
            },
        });
    }

    // Apply all requests
    console.log(`[SLIDES] Applying ${requests.length} requests to presentation ${presentationId}`);

    try {
        await slides.presentations.batchUpdate({
            presentationId,
            resource: { requests },
        });
        console.log(`[SLIDES] Successfully created presentation with ${uploadedPhotos.length} photos`);
    } catch (err) {
        console.error('[SLIDES] Batch update error:', err.message);
        console.error('[SLIDES] Error details:', JSON.stringify(err.response?.data || err, null, 2));

        // Re-throw the error so the caller knows something went wrong
        throw new Error(`Failed to create presentation content: ${err.message}`);
    }

    return {
        presentationId,
        presentationUrl: `https://docs.google.com/presentation/d/${presentationId}`,
    };
}
