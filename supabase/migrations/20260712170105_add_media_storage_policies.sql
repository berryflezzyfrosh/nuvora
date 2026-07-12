/*
# Add storage policies for media bucket

1. Security:
   - Allow authenticated users to upload to the media bucket.
   - Allow public read access (bucket is public).
   - Allow authenticated users to delete their own files (by path prefix).

2. Notes:
   - The media bucket is public, so anyone can read uploaded files.
   - Only authenticated users can upload.
   - Users can only delete files within their own user ID folder prefix.
*/

DROP POLICY IF EXISTS "media_upload_authenticated" ON storage.objects;
CREATE POLICY "media_upload_authenticated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "media_read_public" ON storage.objects;
CREATE POLICY "media_read_public"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_delete_own" ON storage.objects;
CREATE POLICY "media_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
