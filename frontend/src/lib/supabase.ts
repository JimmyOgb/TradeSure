import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Checks if Supabase credentials have been configured with real project values.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || url.includes("your-project-id") || !url.startsWith("https://")) {
    return false;
  }

  const hasKey =
    (serviceKey && !serviceKey.includes("your-supabase-service-role-key")) ||
    (anonKey && !anonKey.includes("your-supabase-anon-key"));

  return Boolean(hasKey);
}

/**
 * Server-side Supabase client using Service Role key for authenticated backend operations.
 * Never exposed to the browser.
 */
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("your-project-id")) {
    throw new Error(
      "Supabase is not configured. Missing valid NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}

/**
 * Client-side safe Supabase instance using the anonymous public key.
 */
export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("your-project-id")) {
    throw new Error(
      "Supabase client not configured. Missing valid NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(url, key);
}

export const EVIDENCE_STORAGE_BUCKET = "evidence-vault";
