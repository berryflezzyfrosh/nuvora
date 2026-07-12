/*
# Add content column to messages and avatar_emoji to profiles

1. Changes to `messages` table:
   - Add `content` text column (nullable) to store plaintext message content.
   - The existing `encrypted_content` column remains for future E2EE use.
   
2. Changes to `profiles` table:
   - Add `avatar_emoji` text column (nullable) to store emoji-based avatars.

3. Security:
   - No RLS policy changes needed — existing policies cover the new columns automatically.

4. Notes:
   - These columns are additive and nullable, so existing data is not affected.
   - The app currently stores messages as plaintext in `content`; the `encrypted_content`/`iv` columns remain available for future encryption.
*/

ALTER TABLE messages ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_emoji text;
