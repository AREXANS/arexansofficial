import { supabase } from '@/integrations/supabase/client';

export type QueueStatus = 'queued' | 'running' | 'done' | 'error';
export interface QueueTask {
  id: string;
  label: string;
  status: QueueStatus;
  progress: number; // 0-100
  stage: string;
  error?: string;
  sizeBytes?: number;
}
type Runner = (update: (progress: number, stage?: string) => void) => Promise<void>;

const MAX_CONCURRENT = 2;
let tasks: QueueTask[] = [];
const runners = new Map<string, { run: Runner; onDone?: () => void }>();
const listeners = new Set<(t: QueueTask[]) => void>();
let running = 0;

const emit = () => { const snap = [...tasks]; listeners.forEach(l => l(snap)); };
const patch = (id: string, p: Partial<QueueTask>) => {
  tasks = tasks.map(t => (t.id === id ? { ...t, ...p } : t));
  emit();
};

export const subscribeQueue = (fn: (t: QueueTask[]) => void) => {
  listeners.add(fn); fn([...tasks]);
  return () => { listeners.delete(fn); };
};
export const clearFinished = () => { tasks = tasks.filter(t => t.status === 'queued' || t.status === 'running'); emit(); };

const pump = () => {
  while (running < MAX_CONCURRENT) {
    const next = tasks.find(t => t.status === 'queued');
    if (!next) return;
    const r = runners.get(next.id);
    if (!r) { patch(next.id, { status: 'error', error: 'runner hilang' }); continue; }
    running++;
    patch(next.id, { status: 'running', stage: 'Memulai...' });
    let last = 0;
    r.run((progress, stage) => {
      const now = Date.now();
      if (progress < 100 && now - last < 120 && !stage) return; // throttle UI updates
      last = now;
      patch(next.id, { progress: Math.max(0, Math.min(100, Math.round(progress))), ...(stage ? { stage } : {}) });
    })
      .then(() => {
        patch(next.id, { status: 'done', progress: 100, stage: 'Selesai' });
        r.onDone?.();
        setTimeout(() => {
          tasks = tasks.filter(t => t.id !== next.id);
          emit();
        }, 3000);
      })
      .catch((e: any) => patch(next.id, { status: 'error', error: e?.message || String(e), stage: 'Gagal' }))
      .finally(() => { running--; runners.delete(next.id); pump(); });
  }
};

export const enqueue = (label: string, run: Runner, opts?: { onDone?: () => void; sizeBytes?: number }) => {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  tasks = [...tasks, { id, label, status: 'queued', progress: 0, stage: 'Antri...', sizeBytes: opts?.sizeBytes }];
  runners.set(id, { run, onDone: opts?.onDone });
  emit();
  pump();
  return id;
};

/** Read a File as text with progress (0-100 mapped by caller). */
export const readFileWithProgress = (file: File, onProgress: (pct: number) => void) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = e => { if (e.lengthComputable) onProgress((e.loaded / e.total) * 100); };
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsText(file);
  });

const REST_URL = '/rest/v1';
const API_KEY = 'cloudsql-postgres-client-key';

const getRestUrl = (filter: string | null) => {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${origin}${REST_URL}/lua_scripts${filter ? `?${filter}` : ''}`;
};

/** Send a row write to lua_scripts via direct XHR with upload progress and timeout safety */
export const writeLuaScript = async (
  method: 'PATCH' | 'POST',
  body: Record<string, unknown>,
  filter: string | null,
  onProgress: (pct: number) => void,
): Promise<void> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const url = getRestUrl(filter);
  const auth = token ? `Bearer ${token}` : (!API_KEY.startsWith('sb_') ? `Bearer ${API_KEY}` : '');

  return new Promise<void>((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          try { xhr.abort(); } catch {}
          reject(new Error('Penyimpanan timeout (30s)'));
        }
      }, 30000);

      xhr.open(method, url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('apikey', API_KEY);
      if (auth) xhr.setRequestHeader('Authorization', auth);
      xhr.setRequestHeader('Prefer', 'return=minimal');

      if (xhr.upload) {
        xhr.upload.onprogress = (ev: ProgressEvent) => {
          if (ev.lengthComputable && ev.total > 0) {
            const pct = Math.min(99, Math.round((ev.loaded / ev.total) * 100));
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
        } else {
          let errMsg = `HTTP ${xhr.status}`;
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed.error) errMsg = parsed.error;
          } catch {}
          reject(new Error(errMsg));
        }
      };

      xhr.onerror = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        // Fallback to direct fetch
        fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'apikey': API_KEY,
            ...(auth ? { 'Authorization': auth } : {}),
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(body)
        })
          .then(async (res) => {
            if (res.ok) {
              onProgress(100);
              resolve();
            } else {
              const err = await res.json().catch(() => ({}));
              reject(new Error(err.error || `HTTP ${res.status}`));
            }
          })
          .catch((fetchErr) => {
            reject(new Error(fetchErr.message || 'Koneksi gagal saat menyimpan script'));
          });
      };

      xhr.ontimeout = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(new Error('Timeout saat menyimpan script'));
      };

      const payload = JSON.stringify(body);
      xhr.send(payload);
    } catch (err: any) {
      reject(err);
    }
  });
};

/** Yield to the browser so heavy string work doesn't freeze the UI. */
export const idle = () => new Promise<void>(r => setTimeout(r, 0));
