/*
# Drop old NUVORA schema

Drops the old tables from the previous NUVORA app so the new WhatsApp clone
schema can be created fresh. These tables had different column structures
(e.g. chat_members had no role column, messages had no encrypted_content).

## Tables dropped (all data lost — this is a full rebuild)
- reactions, messages, chat_members, chats, profiles
*/
DROP TABLE IF EXISTS reactions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS chat_members CASCADE;
DROP TABLE IF EXISTS chats CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
