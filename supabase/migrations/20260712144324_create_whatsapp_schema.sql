/*
# WhatsApp Clone — Full Schema

## Overview
Complete data model for a WhatsApp clone with E2EE messaging, group chats,
status/stories, calls, reactions, blocking, muting, archiving, and starred messages.
All message content is stored as encrypted ciphertext — the server never sees plaintext.

## Tables
- profiles: user profile + E2EE public key
- chats: direct or group conversations
- chat_members: join table with roles, mute, archive, read cursors
- messages: encrypted messages with media support
- message_status: per-recipient sent/delivered/read status
- reactions: emoji reactions
- statuses: disappearing 24h stories
- status_views: who viewed a status
- calls: call history
- blocked_users: block relationships
- starred_messages: bookmarked messages
- session_log: login audit log

## Security (RLS)
All tables RLS-enabled. Authenticated users can read profiles globally,
modify only their own data. Chat access scoped via chat_members membership.
Messages stored as encrypted ciphertext only.

## Notes
1. auth.uid() for all ownership checks.
2. Owner columns default to auth.uid().
3. Membership checks via EXISTS subquery.
4. Idempotent statements.
*/

-- ===== Create all tables =====
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  full_name text NOT NULL,
  avatar_url text,
  bio text DEFAULT '',
  phone text,
  public_key text,
  is_online boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct','group')),
  name text,
  avatar_url text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  disappearing_timer integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  muted boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  last_delivered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_content text NOT NULL DEFAULT '',
  iv text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','video','audio','document','voice')),
  media_url text,
  reply_to_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  forwarded_from uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  is_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_status (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','read')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_content text NOT NULL DEFAULT '',
  iv text NOT NULL DEFAULT '',
  media_url text,
  status_type text NOT NULL DEFAULT 'text' CHECK (status_type IN ('text','image','video')),
  privacy text NOT NULL DEFAULT 'all' CHECK (privacy IN ('all','selected')),
  visible_to text[],
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS status_views (
  status_id uuid NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (status_id, user_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'voice' CHECK (type IN ('voice','video')),
  status text NOT NULL DEFAULT 'ongoing' CHECK (status IN ('missed','completed','declined','ongoing')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS starred_messages (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS session_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  device_info text DEFAULT '',
  ip_address text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Enable RLS =====
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE starred_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_log ENABLE ROW LEVEL SECURITY;

-- ===== profiles policies =====
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ===== chats policies =====
DROP POLICY IF EXISTS "chats_select_members" ON chats;
CREATE POLICY "chats_select_members" ON chats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = chats.id AND chat_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "chats_insert_any" ON chats;
CREATE POLICY "chats_insert_any" ON chats FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "chats_update_creator" ON chats;
CREATE POLICY "chats_update_creator" ON chats FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "chats_delete_creator" ON chats;
CREATE POLICY "chats_delete_creator" ON chats FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- ===== chat_members policies =====
DROP POLICY IF EXISTS "members_select_member" ON chat_members;
CREATE POLICY "members_select_member" ON chat_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_members m2 WHERE m2.chat_id = chat_members.chat_id AND m2.user_id = auth.uid()));
DROP POLICY IF EXISTS "members_insert_own" ON chat_members;
CREATE POLICY "members_insert_own" ON chat_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "members_update_own" ON chat_members;
CREATE POLICY "members_update_own" ON chat_members FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "members_delete_admin" ON chat_members;
CREATE POLICY "members_delete_admin" ON chat_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_members m2 WHERE m2.chat_id = chat_members.chat_id AND m2.user_id = auth.uid() AND (m2.role = 'admin' OR chat_members.user_id = auth.uid())));

-- ===== messages policies =====
DROP POLICY IF EXISTS "messages_select_members" ON messages;
CREATE POLICY "messages_select_members" ON messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = messages.chat_id AND chat_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "messages_insert_members" ON messages;
CREATE POLICY "messages_insert_members" ON messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = messages.chat_id AND chat_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "messages_update_sender" ON messages;
CREATE POLICY "messages_update_sender" ON messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS "messages_delete_sender" ON messages;
CREATE POLICY "messages_delete_sender" ON messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- ===== message_status policies =====
DROP POLICY IF EXISTS "mstatus_select" ON message_status;
CREATE POLICY "mstatus_select" ON message_status FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM messages m JOIN chat_members cm ON cm.chat_id = m.chat_id WHERE m.id = message_status.message_id AND cm.user_id = auth.uid()));
DROP POLICY IF EXISTS "mstatus_insert_own" ON message_status;
CREATE POLICY "mstatus_insert_own" ON message_status FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "mstatus_update_own" ON message_status;
CREATE POLICY "mstatus_update_own" ON message_status FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== reactions policies =====
DROP POLICY IF EXISTS "reactions_select_members" ON reactions;
CREATE POLICY "reactions_select_members" ON reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_members cm JOIN messages m ON m.id = reactions.message_id WHERE cm.chat_id = m.chat_id AND cm.user_id = auth.uid()));
DROP POLICY IF EXISTS "reactions_insert_own" ON reactions;
CREATE POLICY "reactions_insert_own" ON reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "reactions_delete_own" ON reactions;
CREATE POLICY "reactions_delete_own" ON reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== statuses policies =====
DROP POLICY IF EXISTS "statuses_select" ON statuses;
CREATE POLICY "statuses_select" ON statuses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (expires_at > now() AND (privacy = 'all' OR (visible_to IS NOT NULL AND auth.uid()::text = ANY(visible_to)))));
DROP POLICY IF EXISTS "statuses_insert_own" ON statuses;
CREATE POLICY "statuses_insert_own" ON statuses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "statuses_delete_own" ON statuses;
CREATE POLICY "statuses_delete_own" ON statuses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== status_views policies =====
DROP POLICY IF EXISTS "status_views_select_own" ON status_views;
CREATE POLICY "status_views_select_own" ON status_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM statuses WHERE statuses.id = status_views.status_id AND statuses.user_id = auth.uid()) OR auth.uid() = status_views.user_id);
DROP POLICY IF EXISTS "status_views_insert_own" ON status_views;
CREATE POLICY "status_views_insert_own" ON status_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ===== calls policies =====
DROP POLICY IF EXISTS "calls_select_party" ON calls;
CREATE POLICY "calls_select_party" ON calls FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id);
DROP POLICY IF EXISTS "calls_insert_caller" ON calls;
CREATE POLICY "calls_insert_caller" ON calls FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id);
DROP POLICY IF EXISTS "calls_update_party" ON calls;
CREATE POLICY "calls_update_party" ON calls FOR UPDATE TO authenticated USING (auth.uid() = caller_id OR auth.uid() = receiver_id) WITH CHECK (true);

-- ===== blocked_users policies =====
DROP POLICY IF EXISTS "blocked_select_own" ON blocked_users;
CREATE POLICY "blocked_select_own" ON blocked_users FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "blocked_insert_own" ON blocked_users;
CREATE POLICY "blocked_insert_own" ON blocked_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "blocked_delete_own" ON blocked_users;
CREATE POLICY "blocked_delete_own" ON blocked_users FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- ===== starred_messages policies =====
DROP POLICY IF EXISTS "starred_select_own" ON starred_messages;
CREATE POLICY "starred_select_own" ON starred_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "starred_insert_own" ON starred_messages;
CREATE POLICY "starred_insert_own" ON starred_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "starred_delete_own" ON starred_messages;
CREATE POLICY "starred_delete_own" ON starred_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== session_log policies =====
DROP POLICY IF EXISTS "session_select_own" ON session_log;
CREATE POLICY "session_select_own" ON session_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "session_insert_own" ON session_log;
CREATE POLICY "session_insert_own" ON session_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat ON chat_members(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_message_status_user ON message_status(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_statuses_user ON statuses(user_id);
CREATE INDEX IF NOT EXISTS idx_statuses_expires ON statuses(expires_at);
CREATE INDEX IF NOT EXISTS idx_calls_receiver ON calls(receiver_id);
CREATE INDEX IF NOT EXISTS idx_blocked_blocker ON blocked_users(blocker_id);

-- ===== Storage bucket for media =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "media_read_all" ON storage.objects;
CREATE POLICY "media_read_all" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'media');
DROP POLICY IF EXISTS "media_insert_own" ON storage.objects;
CREATE POLICY "media_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');
DROP POLICY IF EXISTS "media_update_own" ON storage.objects;
CREATE POLICY "media_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'media' AND owner = auth.uid()) WITH CHECK (bucket_id = 'media');
DROP POLICY IF EXISTS "media_delete_own" ON storage.objects;
CREATE POLICY "media_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'media' AND owner = auth.uid());
