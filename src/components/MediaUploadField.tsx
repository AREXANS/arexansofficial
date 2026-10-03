import { FC, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadMediaFile } from '@/utils/mediaUpload';
import { Upload, X, Film, Image as ImageIcon, Loader2, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface MediaUploadFieldProps {
  label?: string;
  mediaUrl: string;
  mediaType: string;
  onMediaChange: (url: string, type: 'image' | 'video') => void;
  titleSuggestion?: (title: string) => void;
}

export const MediaUploadField: FC<MediaUploadFieldProps> = ({
  label = 'Media (Gambar / Video)',
  mediaUrl,
  mediaType,
  onMediaChange,
  titleSuggestion,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;

    // Check file type
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv)$/i.test(file.name);

    if (!isImage && !isVideo) {
      toast({
        title: 'Format File Tidak Didukung',
        description: 'Silakan upload file gambar (PNG, JPG, GIF, WebP) atau video (MP4, WebM, MOV).',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setUploadProgress('Membaca file...');

    try {
      const result = await uploadMediaFile(file, (msg) => setUploadProgress(msg));
      onMediaChange(result.url, result.type);

      // Auto-suggest title if empty
      if (titleSuggestion) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        titleSuggestion(cleanName);
      }

      toast({
        title: 'Upload Berhasil',
        description: `${result.type === 'video' ? 'Video' : 'Gambar'} (${result.sizeFormatted}) berhasil dipasang.`,
      });
    } catch (err: any) {
      toast({
        title: 'Upload Gagal',
        description: err.message || 'Gagal memproses file media.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {mediaUrl && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {mediaType === 'video' ? (
              <>
                <Film className="w-3 h-3 text-secondary" /> Video
              </>
            ) : (
              <>
                <ImageIcon className="w-3 h-3 text-primary" /> Gambar
              </>
            )}
          </span>
        )}
      </div>

      {/* Drag & drop upload area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-4 transition-all duration-200 text-center ${
          isDragOver
            ? 'border-primary bg-primary/10'
            : 'border-border/60 hover:border-primary/50 bg-background/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        {uploading ? (
          <div className="py-4 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-medium">{uploadProgress}</p>
          </div>
        ) : mediaUrl ? (
          <div className="space-y-3">
            <div className="relative mx-auto max-h-48 overflow-hidden rounded-md border border-border bg-black/40 flex items-center justify-center">
              {mediaType === 'video' ? (
                <video
                  src={mediaUrl}
                  controls
                  className="max-h-48 w-full object-contain"
                  muted
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt="Preview"
                  className="max-h-48 w-full object-contain"
                />
              )}
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7 rounded-full shadow-md"
                onClick={(e) => {
                  e.stopPropagation();
                  onMediaChange('', mediaType as any);
                }}
                title="Hapus media"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Ganti File Media
              </Button>
              <span className="text-[11px] text-muted-foreground">atau edit URL di bawah</span>
            </div>
          </div>
        ) : (
          <div
            className="py-6 cursor-pointer flex flex-col items-center justify-center gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Klik untuk upload atau drag & drop file
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mendukung Gambar (PNG, JPG, GIF, WebP) & Video (MP4, WebM)
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" className="mt-1 text-xs">
              Pilih File dari Perangkat
            </Button>
          </div>
        )}
      </div>

      {/* Manual URL fallback */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Atau masukkan URL media langsung:</span>
          {mediaUrl && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
              <Check className="w-3 h-3" /> Media terpasang
            </span>
          )}
        </div>
        <Input
          value={mediaUrl}
          onChange={(e) => {
            const val = e.target.value;
            const isVid = /\.(mp4|webm|ogg|mov)$/i.test(val);
            onMediaChange(val, isVid ? 'video' : (mediaType as any || 'image'));
          }}
          placeholder="https://... (URL gambar atau video)"
          className="bg-background/50 text-xs font-mono"
        />
      </div>
    </div>
  );
};
