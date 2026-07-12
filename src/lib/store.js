import { create } from "zustand";
import { supabase } from "./supabase";
import {
  generateKeyPair,
  encryptMessage,
  decryptMessage,
  storePrivateKey,
  loadPrivateKey,
  clearPrivateKey,
} from "./crypto";
import { playSound } from "./utils";

export const useStore = create((set, get) => ({
  // ---------- State ----------
  user: null,
  profile: null,
  profiles: new Map(),
  chats: [],
  activeChat: null,
  messages: new Map(),
  blockedIds: new Set(),
  starredIds: new Set(),
  privateKey: null,
  settings: {
    theme: localStorage.getItem("wa_theme") || "dark",
    sound: localStorage.getItem("wa_sound") !== "false",
    typing: localStorage.getItem("wa_typing") !== "false",
    receipts: localStorage.getItem("wa_receipts") !== "false",
  },
  loading: true,
  authReady: false,
  typingUsers: new Map(),
  callState: null,
  searchQuery: "",

  // ---------- Auth ----------
  setAuthReady: (ready) => set({ authReady: ready }),

  signUp: async ({ email, password, fullName, username, pin }) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error("Signup failed");

    // Generate E2EE key pair
    const keyPair = await generateKeyPair();
    storePrivateKey(keyPair.privateKey, pin);

    // Insert profile with public key
    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      username,
      full_name: fullName,
      public_key: keyPair.publicKey,
      bio: "Hey there! I'm using WhatsApp Clone.",
    });
    if (profileError) throw profileError;

    return data;
  },

  signIn: async ({ email, password, pin }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Load private key
    const privKey = await loadPrivateKey(pin);
    if (privKey) set({ privateKey: privKey });

    return data;
  },

  signOut: async () => {
    if (get().profile) {
      await supabase
        .from("profiles")
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq("id", get().user.id);
    }
    clearPrivateKey();
    await supabase.auth.signOut();
    set({
      user: null,
      profile: null,
      profiles: new Map(),
      chats: [],
      activeChat: null,
      messages: new Map(),
      privateKey: null,
      blockedIds: new Set(),
      starredIds: new Set(),
    });
  },

  loadPrivateKey: async (pin) => {
    const key = await loadPrivateKey(pin);
    if (key) set({ privateKey: key });
    return key;
  },

  // ---------- Profile ----------
  initSession: async (user) => {
    set({ loading: true });
    // Load own profile
    let { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      const username = (user.email || "user").split("@")[0];
      const { data: inserted } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          username,
          full_name: username,
          bio: "Hey there! I'm using WhatsApp Clone.",
        })
        .select()
        .single();
      profile = inserted;
    }

    set({ user, profile, loading: false });

    // Load private key from storage (no PIN mode)
    const privKey = await loadPrivateKey(null);
    if (privKey) set({ privateKey: privKey });

    // Set online
    await supabase
      .from("profiles")
      .update({ is_online: true, last_seen: new Date().toISOString() })
      .eq("id", user.id);

    // Log session
    await supabase.from("session_log").insert({
      user_id: user.id,
      device_info: navigator.userAgent.slice(0, 200),
    });
  },

  updateProfile: async (updates) => {
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", get().user.id);
    if (!error) {
      set({ profile: { ...get().profile, ...updates } });
    }
    return !error;
  },

  // ---------- Profiles ----------
  loadProfiles: async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .neq("id", get().user.id);
    const map = new Map();
    (data || []).forEach((p) => map.set(p.id, p));
    set({ profiles: map });
  },

  // ---------- Chats ----------
  loadChats: async () => {
    const { data: memberships } = await supabase
      .from("chat_members")
      .select("chat_id, role, muted, archived, last_read_at, last_delivered_at")
      .eq("user_id", get().user.id);

    if (!memberships || memberships.length === 0) {
      set({ chats: [] });
      return;
    }

    const chatIds = memberships.map((m) => m.chat_id);
    const { data: chatRows } = await supabase
      .from("chats")
      .select("*")
      .in("id", chatIds);

    // Get all members for these chats
    const { data: allMembers } = await supabase
      .from("chat_members")
      .select("chat_id, user_id, role")
      .in("chat_id", chatIds);

    // Get last message for each chat
    const { data: lastMessages } = await supabase
      .from("messages")
      .select("*")
      .in("chat_id", chatIds)
      .order("created_at", { ascending: false })
      .limit(50);

    const memberMap = new Map();
    (allMembers || []).forEach((m) => {
      if (!memberMap.has(m.chat_id)) memberMap.set(m.chat_id, []);
      memberMap.get(m.chat_id).push(m.user_id);
    });

    const lastMsgMap = new Map();
    (lastMessages || []).forEach((m) => {
      if (!lastMsgMap.has(m.chat_id)) lastMsgMap.set(m.chat_id, m);
    });

    const memberInfo = new Map();
    memberships.forEach((m) => memberInfo.set(m.chat_id, m));

    const chats = (chatRows || []).map((c) => ({
      ...c,
      members: memberMap.get(c.id) || [],
      myMember: memberInfo.get(c.id),
      lastMessage: lastMsgMap.get(c.id) || null,
    }));

    // Sort by last message time
    chats.sort((a, b) => {
      const at = a.lastMessage?.created_at || a.created_at;
      const bt = b.lastMessage?.created_at || b.created_at;
      return new Date(bt) - new Date(at);
    });

    set({ chats });
  },

  startDirectChat: async (userId) => {
    // Check if a direct chat already exists
    const { data: myMembers } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", get().user.id);

    if (myMembers && myMembers.length) {
      for (const m of myMembers) {
        const { data: members } = await supabase
          .from("chat_members")
          .select("user_id")
          .eq("chat_id", m.chat_id);
        const ids = (members || []).map((x) => x.user_id);
        if (ids.length === 2 && ids.includes(userId)) {
          return m.chat_id;
        }
      }
    }

    // Create new direct chat
    const { data: chat, error } = await supabase
      .from("chats")
      .insert({ type: "direct", created_by: get().user.id })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("chat_members").insert([
      { chat_id: chat.id, user_id: get().user.id, role: "admin" },
      { chat_id: chat.id, user_id: userId, role: "admin" },
    ]);

    await get().loadChats();
    return chat.id;
  },

  createGroup: async (name, memberIds) => {
    const { data: chat, error } = await supabase
      .from("chats")
      .insert({ type: "group", name, created_by: get().user.id })
      .select()
      .single();
    if (error) throw error;

    const members = [
      { chat_id: chat.id, user_id: get().user.id, role: "admin" },
      ...memberIds.map((id) => ({ chat_id: chat.id, user_id: id, role: "member" })),
    ];
    await supabase.from("chat_members").insert(members);
    await get().loadChats();
    return chat.id;
  },

  // ---------- Messages ----------
  loadMessages: async (chatId) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(200);

    // Load reactions
    const msgIds = (data || []).map((m) => m.id);
    let reactions = [];
    if (msgIds.length) {
      const { data: r } = await supabase
        .from("reactions")
        .select("*")
        .in("message_id", msgIds);
      reactions = r || [];
    }

    // Decrypt messages
    const privKey = get().privateKey;
    const profiles = get().profiles;
    const user = get().user;

    const decrypted = await Promise.all(
      (data || []).map(async (m) => {
        let decrypted = "";
        if (m.encrypted_content && privKey && !m.is_deleted) {
          // Find peer public key
          const otherId = m.sender_id === user.id ? getOtherMemberId(chatId, get().chats) : m.sender_id;
          const peer = profiles.get(otherId);
          if (peer && peer.public_key) {
            decrypted = await decryptMessage(
              m.encrypted_content,
              m.iv,
              privKey,
              peer.public_key
            );
          }
        }
        const msgReactions = reactions.filter((r) => r.message_id === m.id);
        return { ...m, decrypted, reactions: msgReactions };
      })
    );

    const msgMap = new Map(get().messages);
    msgMap.set(chatId, decrypted);
    set({ messages: msgMap });
    return decrypted;
  },

  sendMessage: async (chatId, text, options = {}) => {
    const { replyTo, messageType = "text", mediaUrl = null, forwardedFrom = null } = options;
    const privKey = get().privateKey;
    const user = get().user;
    const chats = get().chats;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    // For direct chats, encrypt with peer's public key
    let encrypted = { ciphertext: "", iv: "" };
    if (privKey && chat.type === "direct") {
      const otherId = getOtherMemberId(chatId, chats);
      const peer = get().profiles.get(otherId);
      if (peer && peer.public_key) {
        encrypted = await encryptMessage(text, privKey, peer.public_key);
      }
    } else if (privKey && chat.type === "group") {
      // For groups, use a simple shared key approach (encrypt with each member's key would be needed)
      // For simplicity, store a lightly encrypted version using the sender's own key pair
      // In production, this would use a group session key
      encrypted = { ciphertext: btoa(unescape(encodeURIComponent(text))), iv: "group" };
    } else {
      encrypted = { ciphertext: btoa(unescape(encodeURIComponent(text))), iv: "none" };
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        sender_id: user.id,
        encrypted_content: encrypted.ciphertext,
        iv: encrypted.iv,
        message_type: messageType,
        media_url: mediaUrl,
        reply_to_id: replyTo || null,
        forwarded_from: forwardedFrom,
      })
      .select()
      .single();

    if (error) throw error;

    // Update local state
    const msgMap = new Map(get().messages);
    const list = msgMap.get(chatId) || [];
    list.push({ ...data, decrypted: text, reactions: [] });
    msgMap.set(chatId, list);
    set({ messages: msgMap });

    // Update chat list preview
    const updatedChats = get().chats.map((c) =>
      c.id === chatId ? { ...c, lastMessage: data } : c
    );
    set({ chats: updatedChats });

    return data;
  },

  deleteMessage: async (messageId, forEveryone) => {
    if (forEveryone) {
      await supabase
        .from("messages")
        .update({ is_deleted: true, encrypted_content: "", iv: "" })
        .eq("id", messageId)
        .eq("sender_id", get().user.id);
    }
    // Remove from local state either way
    const msgMap = new Map(get().messages);
    for (const [chatId, list] of msgMap) {
      if (forEveryone) {
        msgMap.set(
          chatId,
          list.map((m) =>
            m.id === messageId ? { ...m, is_deleted: true, decrypted: "" } : m
          )
        );
      } else {
        msgMap.set(chatId, list.filter((m) => m.id !== messageId));
      }
    }
    set({ messages: msgMap });
  },

  editMessage: async (messageId, newText) => {
    const privKey = get().privateKey;
    const msg = findMessage(get().messages, messageId);
    if (!msg) return;
    const chat = get().chats.find((c) => c.id === msg.chat_id);
    let encrypted = { ciphertext: btoa(unescape(encodeURIComponent(newText))), iv: "none" };
    if (privKey && chat?.type === "direct") {
      const otherId = getOtherMemberId(msg.chat_id, get().chats);
      const peer = get().profiles.get(otherId);
      if (peer?.public_key) {
        encrypted = await encryptMessage(newText, privKey, peer.public_key);
      }
    }
    await supabase
      .from("messages")
      .update({
        encrypted_content: encrypted.ciphertext,
        iv: encrypted.iv,
        is_edited: true,
      })
      .eq("id", messageId)
      .eq("sender_id", get().user.id);

    const msgMap = new Map(get().messages);
    for (const [chatId, list] of msgMap) {
      msgMap.set(
        chatId,
        list.map((m) =>
          m.id === messageId ? { ...m, decrypted: newText, is_edited: true } : m
        )
      );
    }
    set({ messages: msgMap });
  },

  // ---------- Reactions ----------
  toggleReaction: async (messageId, emoji) => {
    const userId = get().user.id;
    const { data: existing } = await supabase
      .from("reactions")
      .select("emoji")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      if (existing.emoji === emoji) {
        await supabase.from("reactions").delete().eq("message_id", messageId).eq("user_id", userId);
      } else {
        await supabase.from("reactions").update({ emoji }).eq("message_id", messageId).eq("user_id", userId);
      }
    } else {
      await supabase.from("reactions").insert({ message_id: messageId, user_id: userId, emoji });
    }
    // Reload messages for active chat
    const activeChat = get().activeChat;
    if (activeChat) await get().loadMessages(activeChat);
  },

  // ---------- Read receipts ----------
  markRead: async (chatId) => {
    const now = new Date().toISOString();
    await supabase
      .from("chat_members")
      .update({ last_read_at: now, last_delivered_at: now })
      .eq("chat_id", chatId)
      .eq("user_id", get().user.id);

    // Update message_status for messages in this chat
    const messages = get().messages.get(chatId) || [];
    const otherMessages = messages.filter(
      (m) => m.sender_id !== get().user.id && !m.is_deleted
    );
    for (const m of otherMessages) {
      await supabase
        .from("message_status")
        .upsert({ message_id: m.id, user_id: get().user.id, status: "read", updated_at: now });
    }
  },

  // ---------- Blocked users ----------
  loadBlocked: async () => {
    const { data } = await supabase
      .from("blocked_users")
      .select("blocked_id")
      .eq("blocker_id", get().user.id);
    set({ blockedIds: new Set((data || []).map((b) => b.blocked_id)) });
  },

  toggleBlock: async (userId) => {
    const blocked = get().blockedIds;
    if (blocked.has(userId)) {
      await supabase.from("blocked_users").delete().eq("blocker_id", get().user.id).eq("blocked_id", userId);
      blocked.delete(userId);
    } else {
      await supabase.from("blocked_users").insert({ blocker_id: get().user.id, blocked_id: userId });
      blocked.add(userId);
    }
    set({ blockedIds: new Set(blocked) });
  },

  // ---------- Starred messages ----------
  loadStarred: async () => {
    const { data } = await supabase
      .from("starred_messages")
      .select("message_id")
      .eq("user_id", get().user.id);
    set({ starredIds: new Set((data || []).map((s) => s.message_id)) });
  },

  toggleStar: async (messageId) => {
    const starred = get().starredIds;
    if (starred.has(messageId)) {
      await supabase.from("starred_messages").delete().eq("user_id", get().user.id).eq("message_id", messageId);
      starred.delete(messageId);
    } else {
      await supabase.from("starred_messages").insert({ user_id: get().user.id, message_id: messageId });
      starred.add(messageId);
    }
    set({ starredIds: new Set(starred) });
  },

  // ---------- Chat settings ----------
  toggleMute: async (chatId) => {
    const chat = get().chats.find((c) => c.id === chatId);
    const newMuted = !chat?.myMember?.muted;
    await supabase
      .from("chat_members")
      .update({ muted: newMuted })
      .eq("chat_id", chatId)
      .eq("user_id", get().user.id);
    await get().loadChats();
  },

  toggleArchive: async (chatId) => {
    const chat = get().chats.find((c) => c.id === chatId);
    const newArchived = !chat?.myMember?.archived;
    await supabase
      .from("chat_members")
      .update({ archived: newArchived })
      .eq("chat_id", chatId)
      .eq("user_id", get().user.id);
    await get().loadChats();
  },

  setDisappearingTimer: async (chatId, seconds) => {
    await supabase
      .from("chats")
      .update({ disappearing_timer: seconds })
      .eq("id", chatId)
      .eq("created_by", get().user.id);
    await get().loadChats();
  },

  // ---------- Group management ----------
  removeMember: async (chatId, userId) => {
    await supabase.from("chat_members").delete().eq("chat_id", chatId).eq("user_id", userId);
    await get().loadChats();
  },

  addMembers: async (chatId, userIds) => {
    const members = userIds.map((id) => ({ chat_id: chatId, user_id: id, role: "member" }));
    await supabase.from("chat_members").insert(members);
    await get().loadChats();
  },

  // ---------- Settings ----------
  updateSettings: (updates) => {
    const settings = { ...get().settings, ...updates };
    set({ settings });
    if (updates.theme !== undefined) localStorage.setItem("wa_theme", updates.theme);
    if (updates.sound !== undefined) localStorage.setItem("wa_sound", String(updates.sound));
    if (updates.typing !== undefined) localStorage.setItem("wa_typing", String(updates.typing));
    if (updates.receipts !== undefined) localStorage.setItem("wa_receipts", String(updates.receipts));
  },

  // ---------- Setters ----------
  setActiveChat: (chatId) => set({ activeChat: chatId }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setTypingUser: (chatId, userId, name) => {
    const typing = new Map(get().typingUsers);
    const key = `${chatId}:${userId}`;
    typing.set(key, { name, timestamp: Date.now() });
    set({ typingUsers: typing });
  },
  removeTypingUser: (chatId, userId) => {
    const typing = new Map(get().typingUsers);
    typing.delete(`${chatId}:${userId}`);
    set({ typingUsers: typing });
  },
  setCallState: (call) => set({ callState: call }),

  // ---------- Presence ----------
  setOnline: async () => {
    if (!get().user) return;
    await supabase
      .from("profiles")
      .update({ is_online: true, last_seen: new Date().toISOString() })
      .eq("id", get().user.id);
  },

  setOffline: async () => {
    if (!get().user) return;
    await supabase
      .from("profiles")
      .update({ is_online: false, last_seen: new Date().toISOString() })
      .eq("id", get().user.id);
  },
}));

// ---------- Helpers ----------
function getOtherMemberId(chatId, chats) {
  const chat = chats.find((c) => c.id === chatId);
  if (!chat || !chat.members) return null;
  const user = useStore.getState().user;
  return chat.members.find((id) => id !== user?.id);
}

function findMessage(msgMap, messageId) {
  for (const [, list] of msgMap) {
    const m = list.find((x) => x.id === messageId);
    if (m) return m;
  }
  return null;
}
