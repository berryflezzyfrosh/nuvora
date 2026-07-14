/*
# Strengthen RLS Security

## Purpose
Tighten RLS policies across the database to enforce strict ownership and membership checks.

## Security changes
1. messages INSERT: WITH CHECK for chat membership
2. reactions INSERT: WITH CHECK for chat membership (via message_id join)
3. message_status INSERT: WITH CHECK for chat membership (via message_id join)
4. New rate_limits table with owner-only RLS
5. CHECK constraints on content lengths and username format
6. Performance index on messages
7. updated_at trigger for profiles
8. Ensure session_log has IP and device columns
*/

-- ==================== 0. Create update_updated_at_column function in public schema ====================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ==================== 1. Tighten messages INSERT ====================
DROP POLICY IF EXISTS "messages_insert_sender" ON messages;
CREATE POLICY "messages_insert_sender" ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.chat_id = messages.chat_id
      AND chat_members.user_id = auth.uid()
    )
  );

-- ==================== 2. Tighten reactions INSERT ====================
DROP POLICY IF EXISTS "reactions_insert_own" ON reactions;
CREATE POLICY "reactions_insert_own" ON reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_members cm
      JOIN messages m ON m.id = reactions.message_id
      WHERE cm.chat_id = m.chat_id
      AND cm.user_id = auth.uid()
    )
  );

-- ==================== 3. Tighten message_status INSERT ====================
DROP POLICY IF EXISTS "message_status_insert_own" ON message_status;
CREATE POLICY "message_status_insert_own" ON message_status
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_members cm
      JOIN messages m ON m.id = message_status.message_id
      WHERE cm.chat_id = m.chat_id
      AND cm.user_id = auth.uid()
    )
  );

-- ==================== 4. Add CHECK constraint on message content length ====================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'messages_content_length_check'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT messages_content_length_check
      CHECK (length(encrypted_content) <= 100000);
  END IF;
END $$;

-- ==================== 5. Add index for message queries ====================
CREATE INDEX IF NOT EXISTS idx_messages_chat_created
  ON messages (chat_id, created_at DESC);

-- ==================== 6. Create rate_limits table ====================
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limits_select_own" ON rate_limits;
CREATE POLICY "rate_limits_select_own" ON rate_limits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rate_limits_insert_own" ON rate_limits;
CREATE POLICY "rate_limits_insert_own" ON rate_limits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rate_limits_delete_own" ON rate_limits;
CREATE POLICY "rate_limits_delete_own" ON rate_limits
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action_time
  ON rate_limits (user_id, action, created_at DESC);

-- ==================== 7. Add CHECK constraint on profile bio length ====================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_bio_length_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_bio_length_check
      CHECK (length(bio) <= 200);
  END IF;
END $$;

-- ==================== 8. Add CHECK constraint on chat name length ====================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chats_name_length_check'
  ) THEN
    ALTER TABLE chats ADD CONSTRAINT chats_name_length_check
      CHECK (length(name) <= 100);
  END IF;
END $$;

-- ==================== 9. Add CHECK constraint on username format ====================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_username_format_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_format_check
      CHECK (username ~ '^[a-z0-9_]{3,30}$');
  END IF;
END $$;

-- ==================== 10. Add updated_at trigger for profiles ====================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'profiles' AND trigger_name = 'profiles_updated_at'
  ) THEN
    CREATE TRIGGER profiles_updated_at
      BEFORE UPDATE ON profiles
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ==================== 11. Ensure session_log has IP and device info ====================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_log' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE session_log ADD COLUMN ip_address text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_log' AND column_name = 'device_info'
  ) THEN
    ALTER TABLE session_log ADD COLUMN device_info text;
  END IF;
END $$;
