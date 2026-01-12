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

    // Group photos by itemId
    const photosByItem = {};
    for (const photo of uploadedPhotos) {
        if (!photosByItem[photo.itemId]) {
            photosByItem[photo.itemId] = [];
        }
        photosByItem[photo.itemId].push(photo);
    }

    // Get sectionFindings for findings slides
    const sectionFindings = auditData.sectionFindings || {};
    console.log('[SLIDES] sectionFindings received:', JSON.stringify(sectionFindings));

    // SECTION-BASED SLIDE CREATION
    // For each section: create photo slides THEN findings slide
    let slideIndex = 0;
    let findingsSlideIndex = 0;

    for (const section of sections) {
        const sectionId = section.section_id || section.sectionId;
        const sectionTitle = section.sectionTitle || section.section_title || 'Audit Photo';

        // Get all items in this section
        const items = section.items || [];
        const subsectionItems = (section.subsections || []).flatMap(sub => sub.items || []);
        const allItems = [...items, ...subsectionItems];

        console.log(`[SLIDES] Processing section: ${sectionTitle} (${sectionId}) with ${allItems.length} items`);

        // Find photos belonging to items in this section
        const sectionPhotoItems = [];
        for (const item of allItems) {
            const itemId = item.sl_no || item.slNo || item.item_id || item.itemId;
            const photos = photosByItem[itemId] || photosByItem[String(itemId)];
            if (photos && photos.length > 0) {
                sectionPhotoItems.push({
                    itemId: itemId,
                    photos: photos,
                    remarks: item.remarks || '',
                });
            }
        }

        console.log(`[SLIDES] Section ${sectionTitle}: Found ${sectionPhotoItems.length} items with photos`);

        // Create photo slides for this section
        for (const photoItem of sectionPhotoItems) {
            const photoSlideId = `photo_slide_${slideIndex++}`;
            const itemPhotos = photoItem.photos;
            const itemRemarks = photoItem.remarks;
            const photoCount = Math.min(itemPhotos.length, 3);

            // Photo layout positions for 1, 2, or 3 photos
            const layouts = {
                1: [{ x: 158, y: 75, w: 400, h: 280 }],
                2: [{ x: 55, y: 80, w: 300, h: 260 }, { x: 365, y: 80, w: 300, h: 260 }],
                3: [{ x: 30, y: 85, w: 210, h: 250 }, { x: 255, y: 85, w: 210, h: 250 }, { x: 480, y: 85, w: 210, h: 250 }],
            };
            const positions = layouts[photoCount] || layouts[1];

            // Create blank slide
            requests.push({
                createSlide: {
                    objectId: photoSlideId,
                    slideLayoutReference: { predefinedLayout: 'BLANK' },
                },
            });

            // Add teal header box background
            requests.push({
                createShape: {
                    objectId: `${photoSlideId}_title_bg`,
                    shapeType: 'RECTANGLE',
                    elementProperties: {
                        pageObjectId: photoSlideId,
                        size: { width: { magnitude: 680, unit: 'PT' }, height: { magnitude: 45, unit: 'PT' } },
                        transform: { scaleX: 1, scaleY: 1, translateX: 18, translateY: 10, unit: 'PT' },
                    },
                },
            });

            // Fill header box with teal color
            requests.push({
                updateShapeProperties: {
                    objectId: `${photoSlideId}_title_bg`,
                    shapeProperties: {
                        shapeBackgroundFill: {
                            solidFill: { color: { rgbColor: { red: 0.15, green: 0.5, blue: 0.55 } } },
                        },
                        outline: {
                            outlineFill: { solidFill: { color: { rgbColor: { red: 0.15, green: 0.5, blue: 0.55 } } } },
                        },
                    },
                    fields: 'shapeBackgroundFill,outline',
                },
            });

            // Add section title text on top of the box
            requests.push({
                createShape: {
                    objectId: `${photoSlideId}_title`,
                    shapeType: 'TEXT_BOX',
                    elementProperties: {
                        pageObjectId: photoSlideId,
                        size: { width: { magnitude: 680, unit: 'PT' }, height: { magnitude: 45, unit: 'PT' } },
                        transform: { scaleX: 1, scaleY: 1, translateX: 18, translateY: 10, unit: 'PT' },
                    },
                },
            });

            requests.push({
                insertText: {
                    objectId: `${photoSlideId}_title`,
                    text: sectionTitle,
                },
            });

            // Style section title - white, bold, centered
            requests.push({
                updateTextStyle: {
                    objectId: `${photoSlideId}_title`,
                    style: {
                        fontSize: { magnitude: 24, unit: 'PT' },
                        fontFamily: 'Arial',
                        bold: true,
                        foregroundColor: { opaqueColor: { rgbColor: { red: 1.0, green: 1.0, blue: 1.0 } } },
                    },
                    textRange: { type: 'ALL' },
                    fields: 'fontSize,fontFamily,bold,foregroundColor',
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

            // Add photo images (using photoCount and layouts defined at start of loop)
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
                                    width: { magnitude: pos.w, unit: 'PT' },
                                    height: { magnitude: pos.h, unit: 'PT' }
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

        // Create findings slide for THIS section (right after its photos)
        const findings = sectionFindings[sectionId] || [];
        console.log(`[SLIDES] Section ${sectionId}: ${findings.length} findings`);

        if (findings.length > 0) {
            const findingsSlideId = `findings_slide_${findingsSlideIndex++}`;

            // Create blank slide
            requests.push({
                createSlide: {
                    objectId: findingsSlideId,
                    slideLayoutReference: { predefinedLayout: 'BLANK' },
                },
            });

            // Teal header box (same style as photo slides)
            requests.push({
                createShape: {
                    objectId: `${findingsSlideId}_header_bg`,
                    shapeType: 'RECTANGLE',
                    elementProperties: {
                        pageObjectId: findingsSlideId,
                        size: { width: { magnitude: 680, unit: 'PT' }, height: { magnitude: 45, unit: 'PT' } },
                        transform: { scaleX: 1, scaleY: 1, translateX: 18, translateY: 10, unit: 'PT' },
                    },
                },
            });

            requests.push({
                updateShapeProperties: {
                    objectId: `${findingsSlideId}_header_bg`,
                    shapeProperties: {
                        shapeBackgroundFill: {
                            solidFill: { color: { rgbColor: { red: 0.15, green: 0.5, blue: 0.55 } } },
                        },
                        outline: {
                            outlineFill: { solidFill: { color: { rgbColor: { red: 0.15, green: 0.5, blue: 0.55 } } } },
                        },
                    },
                    fields: 'shapeBackgroundFill,outline',
                },
            });

            // Header text
            requests.push({
                createShape: {
                    objectId: `${findingsSlideId}_header`,
                    shapeType: 'TEXT_BOX',
                    elementProperties: {
                        pageObjectId: findingsSlideId,
                        size: { width: { magnitude: 680, unit: 'PT' }, height: { magnitude: 45, unit: 'PT' } },
                        transform: { scaleX: 1, scaleY: 1, translateX: 18, translateY: 10, unit: 'PT' },
                    },
                },
            });

            requests.push({
                insertText: {
                    objectId: `${findingsSlideId}_header`,
                    text: `${sectionTitle} ISSUES`,
                },
            });

            requests.push({
                updateTextStyle: {
                    objectId: `${findingsSlideId}_header`,
                    style: {
                        fontSize: { magnitude: 24, unit: 'PT' },
                        fontFamily: 'Arial',
                        bold: true,
                        foregroundColor: { opaqueColor: { rgbColor: { red: 1.0, green: 1.0, blue: 1.0 } } },
                    },
                    textRange: { type: 'ALL' },
                    fields: 'fontSize,fontFamily,bold,foregroundColor',
                },
            });

            requests.push({
                updateParagraphStyle: {
                    objectId: `${findingsSlideId}_header`,
                    style: { alignment: 'CENTER' },
                    textRange: { type: 'ALL' },
                    fields: 'alignment',
                },
            });

            // Findings list
            const findingsText = findings.map((f, i) => `${i + 1}. ${f}`).join('\n');

            requests.push({
                createShape: {
                    objectId: `${findingsSlideId}_content`,
                    shapeType: 'TEXT_BOX',
                    elementProperties: {
                        pageObjectId: findingsSlideId,
                        size: { width: { magnitude: 660, unit: 'PT' }, height: { magnitude: 420, unit: 'PT' } },
                        transform: { scaleX: 1, scaleY: 1, translateX: 28, translateY: 70, unit: 'PT' },
                    },
                },
            });

            requests.push({
                insertText: {
                    objectId: `${findingsSlideId}_content`,
                    text: findingsText,
                },
            });

            requests.push({
                updateTextStyle: {
                    objectId: `${findingsSlideId}_content`,
                    style: {
                        fontSize: { magnitude: 16, unit: 'PT' },
                        fontFamily: 'Arial',
                    },
                    textRange: { type: 'ALL' },
                    fields: 'fontSize,fontFamily',
                },
            });

            // Teal bar at bottom
            requests.push({
                createShape: {
                    objectId: `${findingsSlideId}_bar`,
                    shapeType: 'RECTANGLE',
                    elementProperties: {
                        pageObjectId: findingsSlideId,
                        size: { width: { magnitude: 720, unit: 'PT' }, height: { magnitude: 8, unit: 'PT' } },
                        transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 532, unit: 'PT' },
                    },
                },
            });

            requests.push({
                updateShapeProperties: {
                    objectId: `${findingsSlideId}_bar`,
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
    } // End of section loop

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
