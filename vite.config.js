import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    // For GitHub Pages, set VITE_BASE_URL to your repo path, e.g. "/NUVORA-CHAT-APP/".
    // Use "/" if deploying to a custom domain or username.github.io repo.
    base: env.VITE_BASE_URL || "/",
    server: { host: true, port: 5173 },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL || ""),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ""),
    },
  };
});
