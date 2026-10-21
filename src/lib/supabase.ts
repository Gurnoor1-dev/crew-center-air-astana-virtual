import { createClient } from '@supabase/supabase-js';

// The publishable key is safe for browser use; all privileged account operations live in
// the crew-auth Edge Function and never expose the service-role key to the client.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://huqvffdiwqilbpxepfpo.supabase.co';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || 'sb_publishable_kf4z7fjeqrd0yrh_jGmWDg_JhWl3J8j';
export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
export const supabaseConfigured = Boolean(supabase);
