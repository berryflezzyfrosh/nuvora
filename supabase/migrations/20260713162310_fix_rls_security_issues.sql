/*
# Fix RLS security issues on calls table and media storage bucket

## Problem 1: calls_update_party always-true WITH CHECK
The `calls_update_party` UPDATE policy on `public.calls` had `WITH CHECK (true)`,
meaning any authenticated user could update any call row regardless of ownership.
This bypasses row-level security entirely for UPDATE operations.

### Fix
Drop and recreate the policy with a proper ownership check:
- USING: user must be the caller or receiver of the existing row
- WITH CHECK: user must be the caller or receiver of the resulting row
This ensures only call participants can update call records, and
cannot reassign calls to users who are not participants.

## Problem 2: Public bucket media allows listing all files
The `media` storage bucket is public (objects are accessible via public URL).
Two broad SELECT policies (`media_read_all`, `media_read_public`) on
`storage.objects` allowed any client to LIST all files in the bucket,
potentially exposing file names and paths of all users.

### Fix
Drop both broad SELECT policies. Public URL access to individual objects
does NOT require SELECT policies on `storage.objects` — the Supabase
storage API serves public URLs directly. Removing these policies
prevents bucket listing while keeping individual file access working.

## Tables affected
- `public.calls` — UPDATE policy tightened
- `storage.objects` — two SELECT policies removed (media bucket only)

## Security changes
1. `calls_update_party`: WITH CHECK changed from `true` to
   `(auth.uid() = caller_id OR auth.uid() = receiver_id)`
2. `media_read_all` (SELECT on storage.objects for media bucket): DROPPED
3. `media_read_public` (SELECT on storage.objects for media bucket): DROPPED
*/

-- ==================== Fix 1: calls_update_party ====================
DROP POLICY IF EXISTS "calls_update_party" ON calls;
CREATE POLICY "calls_update_party" ON calls
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = receiver_id);

-- ==================== Fix 2: Remove broad media bucket SELECT policies ====================
DROP POLICY IF EXISTS "media_read_all" ON storage.objects;
DROP POLICY IF EXISTS "media_read_public" ON storage.objects;
