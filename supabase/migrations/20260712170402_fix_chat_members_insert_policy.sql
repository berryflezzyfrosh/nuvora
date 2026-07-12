/*
# Fix chat_members INSERT policy to allow adding other users to chats

1. Security changes:
   - Replace the `members_insert_own` policy with `members_insert_chat_creator`.
   - The new policy allows INSERT when:
     a) The user is adding themselves (auth.uid() = user_id), OR
     b) The user is the creator of the chat (chats.created_by = auth.uid()).
   - This allows chat creators to add other users as members when creating a group or direct chat.

2. Notes:
   - The old policy only allowed self-inserts, which blocked creating chats with other users.
   - The new policy still prevents arbitrary inserts — only the chat creator can add others.
*/

DROP POLICY IF EXISTS "members_insert_own" ON chat_members;
DROP POLICY IF EXISTS "members_insert_chat_creator" ON chat_members;

CREATE POLICY "members_insert_chat_creator"
ON chat_members FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM chats
    WHERE chats.id = chat_members.chat_id
    AND chats.created_by = auth.uid()
  )
);
