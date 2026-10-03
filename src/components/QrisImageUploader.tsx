import React, { useRef, useState } from 'react';
import { QrCode, Upload, X, Eye, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface QrisImageUploaderProps {
  value?: string;
  onChange: (dataUrl: string) => void;
  onRemove?: () => void;
  label?: string;
  required?: boolean;
}

export const QrisImageUploader: React.FC<QrisImageUploaderProps> = ({
  value,
  onChange,
  onRemove,
  label = 'Upload Gambar QRIS Anda *',
  required = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar (JPG, PNG, WebP).');
      return;
    }
    setError(null);
    setProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Compress & normalize size using canvas (max 800px)
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          onChange(compressedDataUrl);
        } else {
          onChange(src);
        }
        setProcessing(false);
      };
      img.onerror = () => {
        setError('Gagal membaca gambar. Silakan coba file lain.');
        setProcessing(false);
      };
      img.src = src;
    };
    reader.onerror = () => {
      setError('Gagal membaca file gambar.');
      setProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
          <QrCode className="w-3.5 h-3.5 text-primary" />
          {label}
        </label>
        {value && (
          <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            QRIS Terpasang
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/jpg, image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {!value ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-primary bg-primary/10 scale-[1.01]'
              : 'border-border/80 hover:border-primary/60 hover:bg-card/60 bg-card/30'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary">
              <Upload className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                {processing ? 'Memproses gambar...' : 'Klik atau Tarik Gambar QRIS ke Sini'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Format: PNG, JPG, JPEG, atau WebP (Bebas ukuran, otomatis dioptimalkan)
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] text-primary font-medium">
              <QrCode className="w-3 h-3" />
              Tanpa ketik manual, upload foto QRIS langsung
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-xl border border-primary/40 bg-card/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              onClick={() => setPreviewOpen(true)}
              className="relative w-14 h-14 rounded-lg overflow-hidden border border-border bg-black/40 cursor-pointer group flex-shrink-0"
            >
              <img
                src={value}
                alt="QRIS Reseller"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                <Eye className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-primary" />
                Gambar QRIS Siap Digunakan
              </div>
              <p className="text-[10px] text-muted-foreground">
                Admin akan scan QRIS ini saat mencairkan komisi Anda.
              </p>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="text-[10px] text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                Lihat gambar penuh
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-7 text-[10px] px-2.5 rounded-lg border-primary/40 text-primary hover:bg-primary/10"
            >
              Ganti Foto
            </Button>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[10px] text-destructive font-medium">{error}</p>}

      {/* Modal Zoom Preview Gambar QRIS */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-sm p-5 bg-card/95 backdrop-blur-2xl border-border/80 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <QrCode className="w-4 h-4 text-primary" />
              Pratinjau Gambar QRIS Pencairan
            </DialogTitle>
          </DialogHeader>
          <div className="p-3 bg-white rounded-xl flex items-center justify-center">
            {value && (
              <img
                src={value}
                alt="QRIS Preview"
                className="max-h-[300px] w-auto object-contain rounded"
              />
            )}
          </div>
          <div className="text-center text-[10px] text-muted-foreground">
            Pastikan kode QRIS terlihat jelas dan tidak blur agar pembayaran komisi lancar.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
