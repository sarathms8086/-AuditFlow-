/**
 * Google Slides Service
 * 
 * Creates audit report presentations from templates.
 * 
 * Slide Structure:
 * 1. Cover Slide
 * 2. Project Details
 * 3. Audit Summary
 * 4. Section-wise Observations
 * 5. Photos with Remarks
 * 6. Conclusion & Sign-off
 */

import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';

/**
 * Get Slides API client
 */
function getSlidesClient(accessToken) {
    const auth = getAuthenticatedClient(accessToken);
    return google.slides({ version: 'v1', auth });
}

/**
 * Get Drive API client (for copying templates)
 */
function getDriveClient(accessToken) {
    const auth = getAuthenticatedClient(accessToken);
    return google.drive({ version: 'v3', auth });
}

/**
 * Copy a template presentation
 */
export async function copyPresentationTemplate(accessToken, templateId, newTitle, folderId) {
    const drive = getDriveClient(accessToken);

    const response = await drive.files.copy({
        fileId: templateId,
        requestBody: {
            name: newTitle,
            parents: folderId ? [folderId] : undefined,
        },
    });

    return {
        presentationId: response.data.id,
        presentationUrl: `https://docs.google.com/presentation/d/${response.data.id}/edit`,
    };
}

/**
 * Create a new presentation from scratch (when no template provided)
 */
export async function createAuditPresentation(accessToken, title, auditData, sections) {
    const slides = getSlidesClient(accessToken);

    // Create empty presentation
    const response = await slides.presentations.create({
        requestBody: {
            title,
        },
    });

    const presentationId = response.data.presentationId;

    // Build the presentation structure
    await buildPresentationSlides(accessToken, presentationId, auditData, sections);

    return {
        presentationId,
        presentationUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
    };
}

/**
 * Build all slides for the presentation
 */
async function buildPresentationSlides(accessToken, presentationId, auditData, sections) {
    const slides = getSlidesClient(accessToken);

    const requests = [];

    // Get the default slide and delete it
    const presentation = await slides.presentations.get({ presentationId });
    const defaultSlideId = presentation.data.slides?.[0]?.objectId;
    if (defaultSlideId) {
        requests.push({ deleteObject: { objectId: defaultSlideId } });
    }

    // Slide 1: Cover Slide
    const coverSlideId = 'cover_slide';
    requests.push(
        {
            createSlide: {
                objectId: coverSlideId,
                slideLayoutReference: { predefinedLayout: 'TITLE' },
            },
        },
        {
            insertText: {
                objectId: `${coverSlideId}_title`,
                text: 'ELECTRICAL SITE AUDIT REPORT',
                insertionIndex: 0,
            },
        }
    );

    // Slide 2: Project Details
    const detailsSlideId = 'details_slide';
    requests.push({
        createSlide: {
            objectId: detailsSlideId,
            slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
        },
    });

    // Slide 3: Audit Summary
    const summarySlideId = 'summary_slide';
    requests.push({
        createSlide: {
            objectId: summarySlideId,
            slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
        },
    });

    // Section slides
    sections.forEach((section, index) => {
        const sectionSlideId = `section_slide_${index}`;
        requests.push({
            createSlide: {
                objectId: sectionSlideId,
                slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
            },
        });
    });

    // Conclusion slide
    const conclusionSlideId = 'conclusion_slide';
    requests.push({
        createSlide: {
            objectId: conclusionSlideId,
            slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
        },
    });

    // Execute batch update to create slides
    await slides.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
    });

    // Now populate the slides with content
    await populateSlideContent(accessToken, presentationId, auditData, sections);
}

/**
 * Populate slides with actual content
 */
async function populateSlideContent(accessToken, presentationId, auditData, sections) {
    const slides = getSlidesClient(accessToken);

    // Get all slides
    const presentation = await slides.presentations.get({ presentationId });
    const slideList = presentation.data.slides || [];

    const requests = [];

    // Cover slide (first slide)
    if (slideList[0]) {
        const coverSlide = slideList[0];
        const titleShape = coverSlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'CENTERED_TITLE' ||
            el.shape?.placeholder?.type === 'TITLE'
        );
        const subtitleShape = coverSlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'SUBTITLE'
        );

        if (titleShape) {
            requests.push({
                insertText: {
                    objectId: titleShape.objectId,
                    text: 'ELECTRICAL SITE AUDIT REPORT',
                    insertionIndex: 0,
                },
            });
        }
        if (subtitleShape) {
            requests.push({
                insertText: {
                    objectId: subtitleShape.objectId,
                    text: `${auditData.siteName}\n${auditData.clientName}\n${auditData.auditDate}`,
                    insertionIndex: 0,
                },
            });
        }
    }

    // Details slide (second slide)
    if (slideList[1]) {
        const detailsSlide = slideList[1];
        const titleShape = detailsSlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'TITLE'
        );
        const bodyShape = detailsSlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'BODY'
        );

        if (titleShape) {
            requests.push({
                insertText: {
                    objectId: titleShape.objectId,
                    text: 'Project Details',
                    insertionIndex: 0,
                },
            });
        }
        if (bodyShape) {
            const detailsText = [
                `Site Name: ${auditData.siteName}`,
                `Client: ${auditData.clientName}`,
                `Project Code: ${auditData.projectCode || 'N/A'}`,
                `Location: ${auditData.location || 'N/A'}`,
                `Audit Date: ${auditData.auditDate}`,
                `Auditor: ${auditData.auditorName}`,
            ].join('\n');
            requests.push({
                insertText: {
                    objectId: bodyShape.objectId,
                    text: detailsText,
                    insertionIndex: 0,
                },
            });
        }
    }

    // Summary slide (third slide)
    if (slideList[2]) {
        const summarySlide = slideList[2];
        const titleShape = summarySlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'TITLE'
        );
        const bodyShape = summarySlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'BODY'
        );

        // Calculate summary stats
        const totalItems = sections.reduce((sum, s) => sum + (s.items?.length || 0), 0);
        const passedItems = sections.reduce((sum, s) =>
            sum + (s.items?.filter(i => i.response === 'YES').length || 0), 0);
        const failedItems = sections.reduce((sum, s) =>
            sum + (s.items?.filter(i => i.response === 'NO').length || 0), 0);
        const naItems = totalItems - passedItems - failedItems;

        if (titleShape) {
            requests.push({
                insertText: {
                    objectId: titleShape.objectId,
                    text: 'Audit Summary',
                    insertionIndex: 0,
                },
            });
        }
        if (bodyShape) {
            const summaryText = [
                `Total Checkpoints: ${totalItems}`,
                `Passed (YES): ${passedItems}`,
                `Failed (NO): ${failedItems}`,
                `Not Applicable: ${naItems}`,
                '',
                `Compliance Rate: ${totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0}%`,
            ].join('\n');
            requests.push({
                insertText: {
                    objectId: bodyShape.objectId,
                    text: summaryText,
                    insertionIndex: 0,
                },
            });
        }
    }

    // Section slides
    for (let i = 0; i < sections.length && i + 3 < slideList.length - 1; i++) {
        const sectionSlide = slideList[i + 3];
        const section = sections[i];
        const titleShape = sectionSlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'TITLE'
        );
        const bodyShape = sectionSlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'BODY'
        );

        if (titleShape) {
            requests.push({
                insertText: {
                    objectId: titleShape.objectId,
                    text: section.sectionTitle,
                    insertionIndex: 0,
                },
            });
        }
        if (bodyShape && section.items) {
            const itemsText = section.items.map(item =>
                `${item.slNo}. ${item.checkingCriteria} - ${item.response || 'N/A'}${item.remarks ? ` (${item.remarks})` : ''}`
            ).join('\n');
            requests.push({
                insertText: {
                    objectId: bodyShape.objectId,
                    text: itemsText,
                    insertionIndex: 0,
                },
            });
        }
    }

    // Conclusion slide (last slide)
    const conclusionSlide = slideList[slideList.length - 1];
    if (conclusionSlide) {
        const titleShape = conclusionSlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'TITLE'
        );
        const bodyShape = conclusionSlide.pageElements?.find(el =>
            el.shape?.placeholder?.type === 'BODY'
        );

        if (titleShape) {
            requests.push({
                insertText: {
                    objectId: titleShape.objectId,
                    text: 'Conclusion & Sign-off',
                    insertionIndex: 0,
                },
            });
        }
        if (bodyShape) {
            requests.push({
                insertText: {
                    objectId: bodyShape.objectId,
                    text: `Audit completed on ${auditData.auditDate}\n\nAuditor: ${auditData.auditorName}\n\n\n_________________________\nSignature`,
                    insertionIndex: 0,
                },
            });
        }
    }

    if (requests.length > 0) {
        await slides.presentations.batchUpdate({
            presentationId,
            requestBody: { requests },
        });
    }
}

/**
 * Replace placeholders in a template presentation
 * Placeholders format: {{PLACEHOLDER_NAME}}
 */
export async function replacePlaceholders(accessToken, presentationId, replacements) {
    const slides = getSlidesClient(accessToken);

    const requests = Object.entries(replacements).map(([placeholder, value]) => ({
        replaceAllText: {
            containsText: {
                text: `{{${placeholder}}}`,
                matchCase: false,
            },
            replaceText: value,
        },
    }));

    if (requests.length > 0) {
        await slides.presentations.batchUpdate({
            presentationId,
            requestBody: { requests },
        });
    }
}

/**
 * Insert an image into a slide
 */
export async function insertImage(accessToken, presentationId, slideId, imageUrl, bounds) {
    const slides = getSlidesClient(accessToken);

    const imageId = `image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await slides.presentations.batchUpdate({
        presentationId,
        requestBody: {
            requests: [
                {
                    createImage: {
                        objectId: imageId,
                        url: imageUrl,
                        elementProperties: {
                            pageObjectId: slideId,
                            size: {
                                width: { magnitude: bounds.width, unit: 'PT' },
                                height: { magnitude: bounds.height, unit: 'PT' },
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: bounds.x,
                                translateY: bounds.y,
                                unit: 'PT',
                            },
                        },
                    },
                },
            ],
        },
    });

    return imageId;
}
