// ============================================================
// NUVORA — Supabase Configuration
// ------------------------------------------------------------
// The Supabase project is pre-provisioned. Credentials are
// injected at build time into the global window object by the
// Vite dev server (see index.html for the fallback). We read
// VITE_ env vars here and create a single shared client.
// ============================================================

const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  window.__NUVORA_SUPABASE_URL__ ||
  "";

const SUPABASE_ANON_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  window.__NUVORA_SUPABASE_ANON_KEY__ ||
  "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("[NUVORA] Missing Supabase credentials. Check .env / build config.");
}

// Create the singleton Supabase client using the CDN UMD bundle.
// The compat script (supabase-js v2 UMD) exposes window.supabase.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// Expose globally for app.js / nuvo-ai.js
window.NUVORA_DB = db;
