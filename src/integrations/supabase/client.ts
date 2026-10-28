import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

// Default packages data for standalone / static deployment (e.g. Vercel)
const DEFAULT_PACKAGES = [
  {
    id: "f4e2af14-c91e-4259-944f-21876e6deba8",
    name: "NORMAL",
    display_name: "Normal",
    price_per_day: 2000,
    description: "Paket standar",
    features: ["Fitur dasar", "Update rutin"],
    is_active: true,
    sort_order: 1,
    created_at: "2026-09-14T08:32:52.045Z",
    updated_at: "2026-09-14T08:32:52.045Z"
  },
  {
    id: "305482a0-5a57-449d-bb70-5af8470505ab",
    name: "VIP",
    display_name: "VIP",
    price_per_day: 3500,
    description: "Paket VIP",
    features: ["Semua fitur Normal", "Fitur VIP eksklusif", "Prioritas support"],
    is_active: true,
    sort_order: 2,
    created_at: "2026-09-14T08:32:52.045Z",
    updated_at: "2026-09-14T08:32:52.045Z"
  },
  {
    id: "d4e2f040-5e06-4d13-ab0a-3601bc7bdd8a",
    name: "LIFETIME",
    display_name: "Lifetime",
    price_per_day: 700000,
    description: "Akses permanen",
    features: ["Semua fitur VIP", "Akses selamanya"],
    is_active: true,
    sort_order: 3,
    created_at: "2026-09-14T08:32:52.045Z",
    updated_at: "2026-09-14T08:32:52.045Z"
  }
];

const SUPABASE_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
const SUPABASE_PUBLISHABLE_KEY = "cloudsql-postgres-client-key";

function createFallbackResponse(urlStr: string): Response {
  let fallbackData: any = [];
  const pathname = urlStr.split('?')[0] || '';

  if (pathname.includes('/rest/v1/packages')) {
    fallbackData = DEFAULT_PACKAGES;
  } else if (pathname.includes('/auth/v1/')) {
    fallbackData = { user: null, session: null };
  } else if (pathname.includes('/functions/v1/check-ip')) {
    fallbackData = { allowed: true, blocked: false };
  } else if (pathname.includes('/rest/v1/')) {
    fallbackData = [];
  } else {
    fallbackData = { success: true };
  }

  return new Response(JSON.stringify(fallbackData), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': `0-${Array.isArray(fallbackData) ? fallbackData.length : 1}/*`,
    },
  });
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    headers.set('apikey', supabaseKey);

    const urlStr = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));

    try {
      const response = await fetch(input, { ...init, headers });
      const contentType = response.headers.get('content-type') || '';

      // If static host returns HTML or error, provide fallback response
      if (
        (contentType.includes('text/html') || !response.ok) &&
        (urlStr.includes('/rest/v1/') || urlStr.includes('/auth/v1/') || urlStr.includes('/functions/v1/'))
      ) {
        if (urlStr.includes('/rest/v1/packages') || urlStr.includes('/auth/v1/')) {
          return createFallbackResponse(urlStr);
        }
      }

      return response;
    } catch {
      // On network failure or offline static deployment, provide fallback response
      return createFallbackResponse(urlStr);
    }
  };
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
  },
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: false,
  }
});
