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
      .then(() => { patch(next.id, { status: 'done', progress: 100, stage: 'Selesai' }); r.onDone?.(); })
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

/** Send a row write to lua_scripts via XHR so we get real upload progress. */
export const writeLuaScript = async (
  method: 'PATCH' | 'POST',
  body: Record<string, unknown>,
  filter: string | null,
  onProgress: (pct: number) => void,
) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const url = `${REST_URL}/lua_scripts${filter ? `?${filter}` : ''}`;
  const auth = token ? `Bearer ${token}` : (!API_KEY.startsWith('sb_') ? `Bearer ${API_KEY}` : '');
  // Serialize + upload inside a Web Worker so huge (50MB+) scripts never freeze the page.
  await new Promise<void>((resolve, reject) => {
    const w = getWorker();
    const id = Math.random().toString(36).slice(2);
    const onMsg = (e: MessageEvent) => {
      const d = e.data; if (d.id !== id) return;
      if (d.type === 'progress') onProgress(d.pct);
      else {
        w.removeEventListener('message', onMsg);
        if (d.type === 'done') {
          resolve();
        } else {
          reject(new Error(d.error));
        }
      }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ id, method, url, body, apiKey: API_KEY, auth });
  });
};

const WORKER_SRC = `self.onmessage=function(e){var m=e.data;var x=new XMLHttpRequest();x.open(m.method,m.url);
x.setRequestHeader('apikey',m.apiKey);if(m.auth)x.setRequestHeader('Authorization',m.auth);
x.setRequestHeader('Content-Type','application/json');x.setRequestHeader('Prefer','return=minimal');x.timeout=1800000;
x.upload.onprogress=function(ev){if(ev.lengthComputable)postMessage({id:m.id,type:'progress',pct:ev.loaded/ev.total*100})};
x.onload=function(){if(x.status>=200&&x.status<300)postMessage({id:m.id,type:'done'});else postMessage({id:m.id,type:'error',error:'HTTP '+x.status+': '+String(x.responseText).slice(0,200)})};
x.onerror=function(){postMessage({id:m.id,type:'error',error:'Koneksi gagal'})};
x.ontimeout=function(){postMessage({id:m.id,type:'error',error:'Timeout'})};
x.send(new Blob([JSON.stringify(m.body)],{type:'application/json'}));};`;
let worker: Worker | null = null;
const getWorker = () => worker ??= new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));

/** Yield to the browser so heavy string work doesn't freeze the UI. */
export const idle = () => new Promise<void>(r => setTimeout(r, 0));
