/**
 * Utility for uploading and processing media files (images and videos)
 * for Backgrounds and Advertisements.
 */

export interface MediaUploadResult {
  url: string;
  type: 'image' | 'video';
  name: string;
  sizeFormatted: string;
}

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

export const uploadMediaFile = async (
  file: File,
  onProgress?: (progressText: string) => void
): Promise<MediaUploadResult> => {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv)$/i.test(file.name);
  const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';
  const sizeFormatted = formatFileSize(file.size);

  onProgress?.('Mempersiapkan file...');

  // Try Catbox upload first for public fast CDN hosting (especially good for videos and larger files)
  try {
    onProgress?.('Mengupload ke server CDN...');
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', file);

    // Try via Vite proxy first, then direct
    let res: Response | null = null;
    try {
      res = await fetch('/catbox-upload/user/api.php', {
        method: 'POST',
        body: formData,
      });
    } catch {
      try {
        res = await fetch('https://catbox.moe/user/api.php', {
          method: 'POST',
          body: formData,
        });
      } catch {
        res = null;
      }
    }

    if (res && res.ok) {
      const url = (await res.text()).trim();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return {
          url,
          type: mediaType,
          name: file.name,
          sizeFormatted,
        };
      }
    }
  } catch (e) {
    console.warn('Catbox upload attempt failed, falling back to Data URL:', e);
  }

  // Fallback: Read as Base64 Data URL
  onProgress?.('Memproses ke Data URL...');
  const dataUrl = await readFileAsDataUrl(file);
  return {
    url: dataUrl,
    type: mediaType,
    name: file.name,
    sizeFormatted,
  };
};
