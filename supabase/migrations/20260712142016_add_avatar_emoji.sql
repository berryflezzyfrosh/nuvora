/*
# Add avatar_emoji column to profiles

## Overview
The frontend supports avatar selection via preset emoji (in addition to uploaded photos).
This migration adds an `avatar_emoji` text column to `profiles` to store the chosen emoji
when no photo is uploaded. Nullable, defaults to null.

## Changes
- profiles: add `avatar_emoji text` column (nullable, no default).

## Security
No policy changes — existing RLS policies already cover the full table.

## Notes
1. Non-destructive: ADD COLUMN IF NOT EXISTS.
2. Existing rows get null for avatar_emoji, which the frontend handles gracefully.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_emoji text;
