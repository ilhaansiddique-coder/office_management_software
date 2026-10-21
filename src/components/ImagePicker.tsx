import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageUpload } from './ImageUpload';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/utils/toast";
import { ensureStorageBucket } from '@/utils/storageSetup';
import { compressImageWithProgress, formatFileSize as formatSize } from '@/utils/imageCompression';
import {
  Image,
  Upload,
  Search,
  X,
  Check,
  Loader2,
  Grid3X3,
  List,
  Trash2
} from 'lucide-react';

interface ImagePickerProps {
  value: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  compact?: boolean;
  placeholder?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

interface StoredImage {
  name: string;
  id: string;
  updated_at: string;
  size: number;
  url: string;
  previewUrl?: string;
}

export const ImagePicker = ({
  value,
  onChange,
  onRemove,
  compact = false,
  placeholder = "Select an image",
  iconOnly = false,
  size = "md",
}: ImagePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [filteredImages, setFilteredImages] = useState<StoredImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolveImageUrl = useCallback((input?: string | null) => {
    if (!input) return "";
    const trimmed = input.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return supabase.storage.from("product-images").getPublicUrl(trimmed).data.publicUrl;
  }, []);

  const displayValue = resolveImageUrl(value);

  const getDisplayName = (url: string) => {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || url;
    } catch {
      const parts = url.split("/").filter(Boolean);
      return parts[parts.length - 1] || url;
    }
  };

  const sizeClasses = (() => {
    if (size === "lg") {
      return {
        iconOnlyButton: "h-14 w-14 p-0 rounded-full",
        regularButtonHeight: compact ? "h-12" : "h-auto",
        iconOnlyImage: "w-7 h-7",
        regularImage: "w-[120px] h-[120px] rounded-[20px]",
        placeholderIcon: "w-8 h-8",
        infoImage: "w-12 h-12",
        hideText: true,
      };
    }
    if (size === "sm") {
      return {
        iconOnlyButton: "h-10 w-10 p-0.5 rounded-lg",
        regularButtonHeight: "h-8",
        iconOnlyImage: "w-full h-full object-cover rounded-md",
        regularImage: "w-6 h-6",
        placeholderIcon: "w-4 h-4",
        infoImage: "w-8 h-8",
        hideText: false,
      };
    }
    return {
      iconOnlyButton: "h-16 w-16 p-0.5 rounded-lg",
      regularButtonHeight: compact ? "h-8" : "h-10",
      iconOnlyImage: "w-full h-full object-cover rounded-md",
      regularImage: "w-6 h-6",
      placeholderIcon: "w-5 h-5",
      infoImage: "w-8 h-8",
      hideText: false,
    };
  })();

  // Fetch images from storage
  const fetchImages = useCallback(async () => {
    setIsLoading(true);
    try {
      const [storageList, productsRes, variantsRes] = await Promise.all([
        supabase.storage
          .from('product-images')
          .list('', {
            limit: 100,
            offset: 0,
            sortBy: { column: 'updated_at', order: 'desc' }
          }),
        supabase
          .from('products')
          .select('image_url')
          .not('image_url', 'is', null)
          .limit(500),
        supabase
          .from('product_variants')
          .select('image_url')
          .not('image_url', 'is', null)
          .limit(500),
      ]);

      if (storageList.error) throw storageList.error;
      if (productsRes.error) throw productsRes.error;
      if (variantsRes.error) throw variantsRes.error;

      const storageFiles = storageList.data || [];
      const storageNameSet = new Set(storageFiles.map((file) => file.name));
      const storageImages: StoredImage[] = storageFiles.map((file) => {
        const publicUrl = supabase.storage.from('product-images').getPublicUrl(file.name).data.publicUrl;
        return {
          name: file.name,
          id: file.id,
          updated_at: file.updated_at,
          size: file.metadata?.size || 0,
          url: publicUrl,
          previewUrl: publicUrl,
        };
      });

      const referencedUrls = [
        ...(productsRes.data || []).map((r) => r.image_url).filter(Boolean),
        ...(variantsRes.data || []).map((r) => r.image_url).filter(Boolean),
      ] as string[];

      const referencedImages: StoredImage[] = Array.from(new Set(referencedUrls))
        .map((rawUrl) => rawUrl.trim())
        .filter((rawUrl) => {
          if (!rawUrl) return false;
          if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return true;
          // Only include storage paths that actually exist to avoid blank tiles.
          return storageNameSet.has(rawUrl);
        })
        .map((rawUrl) => {
          const resolved = resolveImageUrl(rawUrl);
          return {
            name: getDisplayName(resolved),
            id: resolved,
            updated_at: new Date().toISOString(),
            size: 0,
            url: resolved,
            previewUrl: resolved,
          };
        });

      const mergedByUrl = new Map<string, StoredImage>();
      [...storageImages, ...referencedImages].forEach((img) => {
        if (!mergedByUrl.has(img.url)) {
          mergedByUrl.set(img.url, img);
        }
      });

      const mergedImages = Array.from(mergedByUrl.values());
      setImages(mergedImages);
      setFilteredImages(mergedImages);
    } catch (error) {
      console.error('Error fetching images:', error);
      toast.error('Failed to load images');
    } finally {
      setIsLoading(false);
    }
  }, [resolveImageUrl]);

  // Filter images based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredImages(images);
    } else {
      const filtered = images.filter(img =>
        img.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredImages(filtered);
    }
  }, [searchQuery, images]);

  // Load images when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchImages();
    }
  }, [isOpen, fetchImages]);

  const handleImageSelect = (imageUrl: string) => {
    onChange(imageUrl);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit before compression
      toast.error('File size should be less than 10MB');
      return;
    }

    setIsUploading(true);
    const uploadToastId = toast.loading('Compressing image...');

    try {
      // Compress the image before upload
      const originalSize = file.size / 1024; // KB
      console.log(`Original image size: ${originalSize.toFixed(2)}KB`);

      const compressedFile = await compressImageWithProgress(
        file,
        {
          maxSizeKB: 50, // Target 50KB
          maxWidth: 800,
          maxHeight: 800,
          quality: 0.8
        },
        (progress) => {
          if (progress === 100) {
            toast.loading('Uploading compressed image...', { id: uploadToastId });
          }
        }
      );

      const compressedSize = compressedFile.size / 1024; // KB
      const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
      console.log(`Compressed to ${compressedSize.toFixed(2)}KB (${reduction}% reduction)`);

      // First, ensure the storage bucket exists
      const bucketExists = await ensureStorageBucket();
      if (!bucketExists) {
        toast.error('Storage bucket not available. Please contact administrator.', { id: uploadToastId });
        return;
      }

      // Preserve original filename with sanitization
      const originalName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      const sanitizedName = originalName
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^a-zA-Z0-9_-]/g, ''); // Remove special characters
      const fileExt = 'jpg'; // Always use jpg for compressed images
      const fileName = `${Date.now()}_${sanitizedName}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, compressedFile);

      if (error) {
        console.error('Storage upload error:', error);

        // Provide more specific error messages
        if (error.message.includes('Bucket not found')) {
          toast.error('Storage bucket not found. Please contact administrator to set up image storage.', { id: uploadToastId });
        } else if (error.message.includes('permission')) {
          toast.error('Permission denied. Please check your account permissions.', { id: uploadToastId });
        } else {
          toast.error(`Upload failed: ${error.message}`, { id: uploadToastId });
        }
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(data.path);

      // Refresh the image list
      await fetchImages();

      // Select the newly uploaded image
      handleImageSelect(publicUrl);

      toast.success(
        `Image uploaded! Compressed from ${originalSize.toFixed(0)}KB to ${compressedSize.toFixed(0)}KB`,
        { id: uploadToastId }
      );
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload image', { id: uploadToastId });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteImage = async (imageName: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (!confirm('Are you sure you want to delete this image?')) {
      return;
    }

    try {
      const { error } = await supabase.storage
        .from('product-images')
        .remove([imageName]);

      if (error) throw error;

      // Refresh the image list
      await fetchImages();
      toast.success('Image deleted successfully');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete image');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-2">
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className={
              iconOnly
                ? sizeClasses.iconOnlyButton
                : sizeClasses.hideText
                  ? `${sizeClasses.regularButtonHeight} p-1 !rounded-[20px]`
                  : `w-full ${sizeClasses.regularButtonHeight} justify-start`
            }
          >
            {value ? (
              sizeClasses.hideText ? (
                <div className="relative">
                  <img
                    src={displayValue}
                    alt="Selected"
                    className={`${sizeClasses.regularImage} object-cover`}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="absolute -top-1 -right-1 bg-success text-white rounded-full p-0.5">
                    <Check className="w-3 h-3" />
                  </div>
                </div>
              ) : (
                <div className={`flex items-center ${iconOnly ? 'gap-1' : 'gap-2'}`}>
                  <img
                    src={displayValue}
                    alt="Selected"
                    className={`${iconOnly ? sizeClasses.iconOnlyImage : sizeClasses.regularImage} object-cover rounded`}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  {!iconOnly && <span className="truncate">Image selected</span>}
                  {!iconOnly && <Check className="w-4 h-4 text-success" />}
                </div>
              )
            ) : (
              <div className={`flex items-center ${iconOnly ? 'gap-1' : 'gap-2'} ${sizeClasses.hideText ? 'flex-col justify-center w-[120px] h-[120px]' : ''}`}>
                <Image className={`${sizeClasses.placeholderIcon} text-muted-foreground`} />
                {!iconOnly && !sizeClasses.hideText && <span>{placeholder}</span>}
              </div>
            )}
          </Button>
        </DialogTrigger>

        <DialogContent
          className="flex max-w-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl h-[90vh] flex-col overflow-hidden p-0 gap-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header with gradient */}
          <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b bg-gradient-to-br from-primary/5 via-primary/3 to-background shrink-0">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0 mt-0.5">
                <Image className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base sm:text-lg font-semibold mb-2">Select Image</DialogTitle>

                {/* Search and Actions */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <Input
                      placeholder="Search images..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 sm:pl-10 h-8 sm:h-9 text-sm"
                      autoFocus={false}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="h-8 sm:h-9 px-2 sm:px-3 shrink-0"
                  >
                    <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Upload</span>
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                    }}
                    className="hidden"
                  />
                  <div className="flex gap-1">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                    >
                      <Grid3X3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                    >
                      <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 min-h-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center">
                <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-muted/50 mb-3 animate-pulse">
                  <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 animate-spin text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Loading images...</p>
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center">
                <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-muted/50 mb-3">
                  <Image className="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {searchQuery ? 'No images found matching your search' : 'No images uploaded yet'}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {searchQuery ? 'Try a different search term' : 'Click the upload button to add images'}
                </p>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4' : 'space-y-2'}>
                {filteredImages.map((image) => (
                  <div
                    key={image.id}
                    className={`relative group cursor-pointer rounded-lg border-2 transition-all ${value === image.url
                      ? 'border-primary ring-2 ring-primary/20 shadow-sm'
                      : 'border-muted hover:border-primary/50 hover:shadow-sm'
                      } ${viewMode === 'list' ? 'flex items-center gap-3 p-2 sm:p-3' : 'aspect-square overflow-hidden'}`}
                    onClick={() => handleImageSelect(image.url)}
                  >
                    {viewMode === 'grid' ? (
                      <>
                        <img
                          src={image.previewUrl || image.url}
                          alt={image.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        {value === image.url && (
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1 shadow-sm">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs p-2 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {image.name}
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="absolute top-2 left-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => handleDeleteImage(image.name, e)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <img
                          src={image.previewUrl || image.url}
                          alt={image.name}
                          className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-medium truncate">{image.name}</p>
                          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground">
                            <span>{formatFileSize(image.size)}</span>
                            <span>•</span>
                            <span>{formatDate(image.updated_at)}</span>
                          </div>
                        </div>
                        {value === image.url && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 shrink-0"
                          onClick={(e) => handleDeleteImage(image.name, e)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer - Selected Image Info */}
          {value && (
            <div className="px-4 sm:px-6 py-3 border-t bg-muted/30 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <img
                    src={displayValue}
                    alt="Selected"
                    className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded border-2 border-primary/20 shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium">Image selected</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{getDisplayName(displayValue)}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onRemove) onRemove();
                    setIsOpen(false);
                  }}
                  className="h-8 sm:h-9 shrink-0"
                >
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Remove</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
