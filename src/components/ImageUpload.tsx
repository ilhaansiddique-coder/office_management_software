import { useState, useRef, useCallback } from "react";
import { Upload, X, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/utils/toast";
import { ensureStorageBucket } from "@/utils/storageSetup";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  compact?: boolean;
}

export const ImageUpload = ({ value, onChange, onRemove, compact = false }: ImageUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast.error('File size should be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      // First, ensure the storage bucket exists
      const bucketExists = await ensureStorageBucket();
      if (!bucketExists) {
        toast.error('Storage bucket not available. Please contact administrator.');
        return;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);

      if (error) {
        console.error('Storage upload error:', error);
        
        // Provide more specific error messages
        if (error.message.includes('Bucket not found')) {
          toast.error('Storage bucket not found. Please contact administrator to set up image storage.');
        } else if (error.message.includes('permission')) {
          toast.error('Permission denied. Please check your account permissions.');
        } else {
          toast.error(`Upload failed: ${error.message}`);
        }
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(data.path);

      onChange(publicUrl);
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const handleRemove = async () => {
    if (value && onRemove) {
      try {
        // Extract filename from URL
        const url = new URL(value);
        const path = url.pathname.split('/').pop();
        if (path) {
          await supabase.storage.from('product-images').remove([path]);
        }
      } catch (error) {
        console.error('Error removing file:', error);
      }
      onRemove();
    }
  };

  if (value) {
    if (compact) {
      return (
        <div className="relative group w-28">
          <div className="relative w-full h-16 border-2 border-dashed border-muted rounded-md overflow-hidden">
            <img
              src={value}
              alt="Variant image"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'
              }}
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="relative group">
        <div className="relative w-full h-40 border-2 border-dashed border-muted rounded-lg overflow-hidden">
          <img 
            src={value} 
            alt="Product image" 
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/placeholder.svg';
            }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleRemove}
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-1">
        <div
          className={`relative w-28 h-16 border-2 border-dashed rounded-md transition-colors cursor-pointer ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
          } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            {isUploading ? (
              <>
                <Upload className="h-4 w-4 animate-pulse" />
                <p className="text-[10px] mt-1">Uploading...</p>
              </>
            ) : (
              <>
                <Image className="h-4 w-4" />
                <p className="text-[10px] mt-1">Upload</p>
              </>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className={`
          relative w-full h-40 border-2 border-dashed rounded-lg transition-colors cursor-pointer
          ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'}
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
          {isUploading ? (
            <>
              <Upload className="h-8 w-8 animate-pulse" />
              <p className="text-sm mt-2">Uploading...</p>
            </>
          ) : (
            <>
              <Image className="h-8 w-8" />
              <p className="text-sm mt-2 text-center px-2">
                Drag and drop an image here, or click to select
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Max 5MB • PNG, JPG, WEBP
              </p>
            </>
          )}
        </div>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};