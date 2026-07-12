/*
# NUVORA Chat App — Initial Schema

## Overview
Creates the full data model for NUVORA, a real-time chat app with an AI assistant (NUVO).
Supports user profiles, global people discovery, 1-on-1 and group chats, messages with
read receipts, typing indicators, and emoji reactions.

## Tables
- profiles: public user profile (extends auth.users). Global people directory.
- chats: a 1-on-1 or group conversation.
- chat_members: join table; per-user read/delivered cursors for receipts.
- messages: individual messages with optional reply quote.
- reactions: emoji reactions, one per user per message.

## Security (RLS)
- profiles: any authenticated user can SELECT (global directory); users UPDATE/INSERT only their own row.
- chats: members can SELECT; any authenticated user can INSERT (start a chat); creator can UPDATE.
- chat_members: members of the chat can SELECT; a user can INSERT/UPDATE their own row.
- messages: members can SELECT; a user can INSERT into chats they belong to; sender can UPDATE/DELETE their own messages.
- reactions: members can SELECT; a user can INSERT/DELETE their own reactions.

## Notes
1. auth.uid() used for all ownership checks.
2. Owner columns default to auth.uid() so client inserts omitting them still pass WITH CHECK.
3. Membership checks use EXISTS subquery against chat_members.
4. Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS.
*/

-- ===== Create all tables first =====
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  username text NOT NULL,
  avatar_url text,
  bio text DEFAULT '',
  is_online boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group boolean NOT NULL DEFAULT false,
  group_name text,
  group_avatar_url text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  last_delivered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  reply_to uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_for_all boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

-- ===== Enable RLS =====
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

-- ===== profiles policies =====
DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON profiles;
CREATE POLICY "profiles_select_all_authenticated"
  ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ===== chats policies =====
DROP POLICY IF EXISTS "chats_select_members" ON chats;
CREATE POLICY "chats_select_members"
  ON chats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = chats.id AND chat_members.user_id = auth.uid()));

DROP POLICY IF EXISTS "chats_insert_any" ON chats;
CREATE POLICY "chats_insert_any"
  ON chats FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "chats_update_creator" ON chats;
CREATE POLICY "chats_update_creator"
  ON chats FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- ===== chat_members policies =====
DROP POLICY IF EXISTS "members_select_member" ON chat_members;
CREATE POLICY "members_select_member"
  ON chat_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_members m2 WHERE m2.chat_id = chat_members.chat_id AND m2.user_id = auth.uid()));

DROP POLICY IF EXISTS "members_insert_own" ON chat_members;
CREATE POLICY "members_insert_own"
  ON chat_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "members_update_own" ON chat_members;
CREATE POLICY "members_update_own"
  ON chat_members FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== messages policies =====
DROP POLICY IF EXISTS "messages_select_members" ON messages;
CREATE POLICY "messages_select_members"
  ON messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = messages.chat_id AND chat_members.user_id = auth.uid()));

DROP POLICY IF EXISTS "messages_insert_members" ON messages;
CREATE POLICY "messages_insert_members"
  ON messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = messages.chat_id AND chat_members.user_id = auth.uid()));

DROP POLICY IF EXISTS "messages_update_sender" ON messages;
CREATE POLICY "messages_update_sender"
  ON messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "messages_delete_sender" ON messages;
CREATE POLICY "messages_delete_sender"
  ON messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- ===== reactions policies =====
DROP POLICY IF EXISTS "reactions_select_members" ON reactions;
CREATE POLICY "reactions_select_members"
  ON reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_members cm JOIN messages m ON m.id = reactions.message_id WHERE cm.chat_id = m.chat_id AND cm.user_id = auth.uid()));

DROP POLICY IF EXISTS "reactions_insert_own" ON reactions;
CREATE POLICY "reactions_insert_own"
  ON reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reactions_delete_own" ON reactions;
CREATE POLICY "reactions_delete_own"
  ON reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat ON chat_members(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
