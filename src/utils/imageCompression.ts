/**
 * Image Compression Utility
 * Compresses images to under 50KB before upload
 */

export interface CompressionOptions {
  maxSizeKB?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: string;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxSizeKB: 50,
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.8,
  mimeType: 'image/jpeg'
};

/**
 * Compress an image file to under specified size
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onerror = () => reject(new Error('Failed to load image'));
      
      img.onload = () => {
        try {
          // Calculate new dimensions while maintaining aspect ratio
          let { width, height } = img;
          
          if (width > opts.maxWidth || height > opts.maxHeight) {
            const aspectRatio = width / height;
            
            if (width > height) {
              width = opts.maxWidth;
              height = width / aspectRatio;
            } else {
              height = opts.maxHeight;
              width = height * aspectRatio;
            }
          }
          
          // Create canvas and draw resized image
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Use better image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to blob with compression
          compressToTarget(canvas, opts, file.name, resolve, reject);
        } catch (error) {
          reject(error);
        }
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Iteratively compress until target size is reached
 */
function compressToTarget(
  canvas: HTMLCanvasElement,
  options: Required<CompressionOptions>,
  fileName: string,
  resolve: (file: File) => void,
  reject: (error: Error) => void
) {
  let quality = options.quality;
  let attempts = 0;
  const maxAttempts = 10;
  
  const tryCompress = () => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create blob'));
          return;
        }
        
        const sizeKB = blob.size / 1024;
        
        console.log(`Compression attempt ${attempts + 1}: ${sizeKB.toFixed(2)}KB at quality ${quality.toFixed(2)}`);
        
        // If under target size or max attempts reached, we're done
        if (sizeKB <= options.maxSizeKB || attempts >= maxAttempts) {
          const compressedFile = new File([blob], fileName, {
            type: options.mimeType,
            lastModified: Date.now()
          });
          
          console.log(`Final compressed size: ${sizeKB.toFixed(2)}KB`);
          resolve(compressedFile);
          return;
        }
        
        // Otherwise, reduce quality and try again
        quality = quality * 0.9; // Reduce quality by 10%
        attempts++;
        tryCompress();
      },
      options.mimeType,
      quality
    );
  };
  
  tryCompress();
}

/**
 * Check if file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validate image file
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check if it's an image
  if (!isImageFile(file)) {
    return { valid: false, error: 'File must be an image' };
  }
  
  // Check file size (max 10MB before compression)
  const maxSizeBeforeCompression = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSizeBeforeCompression) {
    return { 
      valid: false, 
      error: `Image is too large (${formatFileSize(file.size)}). Maximum size before compression is 10MB.` 
    };
  }
  
  return { valid: true };
}

/**
 * Compress image with progress callback
 */
export async function compressImageWithProgress(
  file: File,
  options: CompressionOptions = {},
  onProgress?: (progress: number) => void
): Promise<File> {
  if (onProgress) onProgress(0);
  
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  if (onProgress) onProgress(30);
  
  const originalSize = file.size / 1024; // KB
  console.log(`Original image size: ${originalSize.toFixed(2)}KB`);
  
  if (onProgress) onProgress(50);
  
  const compressed = await compressImage(file, options);
  
  if (onProgress) onProgress(90);
  
  const compressedSize = compressed.size / 1024; // KB
  const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
  
  console.log(`Compressed from ${originalSize.toFixed(2)}KB to ${compressedSize.toFixed(2)}KB (${reduction}% reduction)`);
  
  if (onProgress) onProgress(100);
  
  return compressed;
}

