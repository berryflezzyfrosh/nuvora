# WhatsApp Clone — React + Vite + Supabase

A full-featured WhatsApp clone with end-to-end encryption, real-time messaging, group chats, status/stories, voice/video calls, and more.

## Features

- **Authentication**: Email/password signup/login via Supabase Auth
- **E2EE**: Messages encrypted client-side using ECDH key exchange + AES-GCM (Web Crypto API). Server only stores ciphertext.
- **Messaging**: Real-time 1-on-1 and group chats with replies, reactions, edit, delete, forward, and read receipts (✓ sent, ✓✓ delivered, blue ✓✓ read)
- **Media**: Image, video, audio, document, and voice message sharing via Supabase Storage
- **Calls**: Voice/video call UI with WebRTC signaling via Supabase Realtime
- **Status/Stories**: Post text/image statuses that expire in 24 hours, with privacy controls
- **Contacts**: Global people directory, block/unblock, mute, archive
- **Presence**: Online/offline status, last seen, typing indicators
- **Settings**: Dark/light theme, notification toggles, read receipt toggles
- **Security**: RLS on all tables, zero-knowledge architecture, session audit log, inactivity auto-logout

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Supabase (Auth, Realtime, Storage, PostgreSQL with RLS)
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Encryption**: Web Crypto API (ECDH + AES-GCM)
- **Routing**: React Router v6 (HashRouter for GitHub Pages)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Run the dev server

```bash
npm run dev
```

### 4. Build for production

```bash
npm run build
```

## Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. The SQL migrations are in `supabase/migrations/` — apply them via the Supabase SQL Editor
3. Enable Email auth (no email confirmation needed for development)
4. The `media` storage bucket is created automatically by the migration
5. Copy your project URL and anon key into `.env`

## GitHub Pages Deployment

### 1. Update the base path

In `vite.config.js`, the `base` is set to `"./"` for relative paths. If you want a specific repo path, change it to `"/your-repo-name/"`.

### 2. Deploy

```bash
npm run deploy
```

This runs `vite build` and then deploys the `dist/` folder to GitHub Pages using the `gh-pages` package.

### 3. Enable GitHub Pages

In your GitHub repo: **Settings → Pages → Source → Deploy from branch → `gh-pages` branch → `/ (root)`**

### 4. Routing

The app uses `HashRouter` (not `BrowserRouter`) so routes work on GitHub Pages without server configuration. A `404.html` fallback is included for SPA routing support.

## File Structure

```
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── public/
│   └── 404.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── lib/
│   │   ├── supabase.js      # Supabase client
│   │   ├── crypto.js        # E2EE (ECDH + AES-GCM)
│   │   ├── store.js         # Zustand store
│   │   └── utils.js         # Helpers
│   └── components/
│       ├── Splash.jsx
│       ├── AuthScreen.jsx
│       ├── ChatApp.jsx
│       ├── Sidebar.jsx
│       ├── ChatWindow.jsx
│       ├── MessageMenu.jsx
│       ├── NewChatModal.jsx
│       ├── MediaUploader.jsx
│       ├── VoiceRecorder.jsx
│       ├── People.jsx
│       ├── Profile.jsx
│       ├── Settings.jsx
│       ├── StatusView.jsx
│       ├── CallModal.jsx
│       └── RealtimeManager.jsx
└── supabase/
    └── migrations/
        └── create_whatsapp_schema.sql
```

## Security Architecture

- **E2EE**: Each user generates an ECDH key pair on signup. The public key is stored in the `profiles` table. To send a message, the sender derives a shared secret using their private key + the recipient's public key, then encrypts with AES-GCM. Only the recipient can decrypt.
- **Zero-knowledge**: Supabase only stores `encrypted_content` (ciphertext) and `iv` (initialization vector). The server never has access to plaintext or encryption keys.
- **RLS**: All 12 tables have Row Level Security enabled with authenticated-only access and ownership checks.
- **Session audit**: Login sessions are logged in `session_log` with device info.
- **Inactivity logout**: Auto-logout after 30 minutes of inactivity.

## License

MIT
