// Auto-integrate Lua script contents with the CURRENT backend project.
// Detects old Supabase project URLs / refs / API keys inside pasted script code
// and rewrites them to the active project's URL + publishable (anon) key.

const CURRENT_URL: string = typeof window !== 'undefined' ? window.location.origin : '';
const CURRENT_KEY: string = 'cloudsql-postgres-client-key';
const CURRENT_REF: string = '';

export interface BackendSyncResult {
  content: string;
  changes: string[];
  changed: boolean;
}

const isSupabaseJwt = (token: string): boolean => {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '='))
    );
    return payload?.iss === 'supabase' || typeof payload?.ref === 'string';
  } catch {
    return false;
  }
};

/** Does this code reference a Supabase backend at all? */
export const hasBackendRefs = (content: string): boolean => {
  if (!content) return false;
  return /supabase\.co/i.test(content) || /eyJhbGciOi[\w-]*\.[\w-]+\.[\w-]+/.test(content) || /sb_publishable_[A-Za-z0-9_-]+/.test(content);
};

/** Is this code already pointing at the current backend (nothing stale)? */
export const isBackendOutdated = (content: string): boolean => syncBackendRefs(content).changed;

export const syncBackendRefs = (content: string): BackendSyncResult => {
  if (!content || !CURRENT_URL || !CURRENT_KEY) {
    return { content, changes: [], changed: false };
  }

  let out = content;
  const changes: string[] = [];
  let urlCount = 0;
  let refCount = 0;
  let keyCount = 0;
  const oldRefs = new Set<string>();

  // 1) Full Supabase project URLs (incl. functions/rest paths)
  out = out.replace(/https?:\/\/([a-z0-9]{16,})\.supabase\.co/gi, (match, ref: string) => {
    if (ref.toLowerCase() === CURRENT_REF.toLowerCase()) return match;
    oldRefs.add(ref);
    urlCount++;
    return CURRENT_URL;
  });

  // 2) Bare old project refs left over (e.g. in project_id constants)
  oldRefs.forEach((ref) => {
    const bare = new RegExp(`\\b${ref}\\b`, 'g');
    out = out.replace(bare, () => {
      refCount++;
      return CURRENT_REF;
    });
  });

  // 3) Legacy anon/service JWT api keys -> current publishable key
  out = out.replace(/eyJhbGciOi[\w-]*\.[\w-]+\.[\w-]+/g, (token) => {
    if (token === CURRENT_KEY) return token;
    if (!isSupabaseJwt(token)) return token;
    keyCount++;
    return CURRENT_KEY;
  });

  // 4) New-style publishable keys
  out = out.replace(/sb_publishable_[A-Za-z0-9_-]+/g, (token) => {
    if (token === CURRENT_KEY) return token;
    keyCount++;
    return CURRENT_KEY;
  });

  if (urlCount) changes.push(`${urlCount} URL backend diperbarui`);
  if (refCount) changes.push(`${refCount} project id lama diganti`);
  if (keyCount) changes.push(`${keyCount} API key lama diintegrasikan`);

  return { content: out, changes, changed: out !== content };
};
