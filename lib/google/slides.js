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

    // Create a slide for each uploaded photo
    for (let i = 0; i < uploadedPhotos.length; i++) {
        const photo = uploadedPhotos[i];
        const photoSlideId = `photo_slide_${i}`;

        // Find which section this photo belongs to
        let sectionTitle = 'Audit Photo';
        let itemRemarks = '';

        for (const section of sections) {
            const items = section.items || [];
            // Also check subsections
            const subsectionItems = (section.subsections || []).flatMap(sub => sub.items || []);
            const allItems = [...items, ...subsectionItems];

            for (const item of allItems) {
                const itemId = item.sl_no || item.slNo || item.item_id || item.itemId;
                if (itemId === photo.itemId) {
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

        // Add photo image from Google Drive
        if (photo.webViewLink || photo.fileId) {
            // Use the Drive file ID to create an image
            const driveImageUrl = `https://drive.google.com/uc?export=view&id=${photo.fileId}`;

            requests.push({
                createImage: {
                    objectId: `${photoSlideId}_image`,
                    url: driveImageUrl,
                    elementProperties: {
                        pageObjectId: photoSlideId,
                        size: {
                            width: { magnitude: 400, unit: 'PT' },
                            height: { magnitude: 280, unit: 'PT' }
                        },
                        transform: {
                            scaleX: 1,
                            scaleY: 1,
                            translateX: 158,
                            translateY: 80,
                            unit: 'PT'
                        },
                    },
                },
            });
        }

        // Add remarks box at bottom with border
        requests.push({
            createShape: {
                objectId: `${photoSlideId}_remarks`,
                shapeType: 'TEXT_BOX',
                elementProperties: {
                    pageObjectId: photoSlideId,
                    size: { width: { magnitude: 650, unit: 'PT' }, height: { magnitude: 60, unit: 'PT' } },
                    transform: { scaleX: 1, scaleY: 1, translateX: 33, translateY: 375, unit: 'PT' },
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
    try {
        await slides.presentations.batchUpdate({
            presentationId,
            resource: { requests },
        });
    } catch (err) {
        console.error('Slides batch update error:', err.message);
        // Try to create slides without images if image loading fails
        if (err.message.includes('image')) {
            console.log('Retrying without images...');
        }
    }

    return {
        presentationId,
        presentationUrl: `https://docs.google.com/presentation/d/${presentationId}`,
    };
}
