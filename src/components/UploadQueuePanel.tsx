import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, X, XCircle, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { subscribeQueue, clearFinished, QueueTask } from '@/lib/uploadQueue';
import { formatFileSize } from '@/utils/mediaUpload';

const UploadQueuePanel = () => {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [open, setOpen] = useState(true);
  useEffect(() => subscribeQueue(setTasks), []);
  if (tasks.length === 0) return null;

  const active = tasks.filter(t => t.status === 'running' || t.status === 'queued').length;
  return (
    <div className="fixed bottom-3 right-3 z-[100] w-[min(92vw,340px)] rounded-xl border border-primary/30 bg-card/95 backdrop-blur shadow-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <button className="flex items-center gap-2 text-sm font-medium" onClick={() => setOpen(o => !o)}>
          {active > 0 ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <CheckCircle2 className="w-4 h-4 text-primary" />}
          {active > 0 ? `Upload berjalan (${active})` : 'Upload selesai'}
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        {active === 0 && (
          <button onClick={clearFinished} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="max-h-72 overflow-y-auto p-2 space-y-2">
          {tasks.map(t => (
            <div key={t.id} className="rounded-lg bg-muted/40 p-2">
              <div className="flex items-center gap-2 text-xs">
                {t.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                {t.status === 'error' && <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                {t.status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
                {t.status === 'queued' && <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="truncate flex-1 font-medium">{t.label}</span>
                <span className="text-muted-foreground">{t.progress}%</span>
              </div>
              <Progress value={t.progress} className="h-1.5 mt-1.5" />
              <div className="mt-1 text-[10px] text-muted-foreground truncate">
                {t.error ? <span className="text-destructive">{t.error}</span> : t.stage}
                {t.sizeBytes ? ` • ${formatFileSize(t.sizeBytes)}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UploadQueuePanel;
