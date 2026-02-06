/**
 * Image compression utility
 * Compresses images before upload to stay within Vercel limits
 */

/**
 * Compress an image blob
 * @param {Blob} blob - Original image blob
 * @param {number} maxWidth - Max width (default 1200px)
 * @param {number} quality - JPEG quality 0-1 (default 0.7)
 * @returns {Promise<Blob>} Compressed image blob
 */
export async function compressImage(blob, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            URL.revokeObjectURL(url);

            // Calculate new dimensions
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }

            // Create canvas and draw resized image
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to blob
            canvas.toBlob(
                (compressedBlob) => {
                    if (compressedBlob) {
                        resolve(compressedBlob);
                    } else {
                        reject(new Error('Failed to compress image'));
                    }
                },
                'image/jpeg',
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

/**
 * Compress image and convert to base64
 */
export async function compressAndConvertToBase64(blob, maxWidth = 1200, quality = 0.7) {
    const compressed = await compressImage(blob, maxWidth, quality);

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Remove data URL prefix to get pure base64
            const base64 = reader.result.split(',')[1];
            resolve({
                base64,
                size: compressed.size,
                mimeType: 'image/jpeg',
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
    });
}

/**
 * Get estimated base64 size
 */
export function estimateBase64Size(byteSize) {
    return Math.ceil(byteSize * 1.37); // Base64 is ~37% larger than binary
}
