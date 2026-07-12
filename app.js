// ============================================================
// NUVORA — Main Application Logic
// ------------------------------------------------------------
// Handles: auth (signup/login/persist), presence, global people
// discovery, real-time 1-on-1 chats, NUVO AI assistant, message
// reactions, reply quotes, delete, copy, read receipts, typing
// indicators, search, profile, settings, theme, notifications.
// ============================================================

import "./supabase-config.js";

const supabase = window.NUVORA_DB;

// ---------- Constants ----------
const NUVO_ID = "00000000-0000-0000-0000-000000000000"; // sentinel for the pinned NUVO chat
const AVATAR_PRESETS = ["🦊", "🐼", "🦄", "🐙", "🦉", "🐳", "🦋", "🌸", "⚡", "🔥", "🌊", "🌟"];
const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","❤️","🔥","🎉","✨","💯","🙏","👏","🤝","😅","🤣","😴","🤯","🥳","😱","🤗","🫶","💪","🧠","👀","✅","❌","⭐","🚀","☕","🍕","🎵"];
const REACTION_EMOJIS = ["👍","❤️","😂","😮","😢","🙏","🔥","👏"];
const PAGE_TITLE = "NUVORA";

// ---------- State ----------
const state = {
  user: null,            // auth user
  profile: null,         // own profile row
  profiles: new Map(),   // all profiles (id -> row)
  chats: new Map(),      // chatId -> chat meta
  activeChatId: null,
  messages: new Map(),   // chatId -> [message]
  subscriptions: [],     // active realtime channels
  typingTimers: new Map(),
  settings: { sound: true, typing: true, receipts: true },
  replyTo: null,
  selectedAvatar: null,   // signup avatar (preset emoji or data URL)
  view: "chats",
};

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const escapeHtml = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Avatar helpers ----------
function avatarContent(profile) {
  if (!profile) return `<i class="fa-solid fa-user"></i>`;
  if (profile.avatar_url) return `<img src="${escapeHtml(profile.avatar_url)}" alt="" />`;
  if (profile.username) return escapeHtml(profile.username.charAt(0).toUpperCase());
  return `<i class="fa-solid fa-user"></i>`;
}
function avatarBg(profile) {
  if (profile && profile.avatar_url) return "";
  // deterministic gradient from id
  const id = (profile && profile.id) || "x";
  const hue = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `background: linear-gradient(135deg, hsl(${hue},65%,55%), hsl(${(hue + 50) % 360},65%,45%));`;
}
function nuvoAvatarHtml(size) {
  return `<div class="chat-item-avatar" style="background:var(--grad)"><i class="fa-solid fa-robot"></i></div>`;
}

// ---------- Time formatting ----------
function fmtTime(ts) { try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function fmtDateSep(ts) { const d = new Date(ts); const today = new Date(); const y = new Date(); y.setDate(y.getDate() - 1); const f = (x) => x.toLocaleDateString([], { day: "numeric", month: "short" }); if (d.toDateString() === today.toDateString()) return "Today"; if (d.toDateString() === y.toDateString()) return "Yesterday"; return f(d); }
function fmtLastSeen(ts) {
  if (!ts) return "a while ago";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" });
}

// ---------- Notification sound (Web Audio API) ----------
let audioCtx = null;
function playSound() {
  if (!state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.setValueAtTime(660, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    o.start(); o.stop(audioCtx.currentTime + 0.3);
  } catch (_) {}
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

// ============================================================
// AUTH
// ============================================================

function showAuth() {
  $("splash").classList.add("hidden");
  $("app").classList.add("hidden");
  $("authScreen").classList.remove("hidden");
}

function showApp() {
  $("splash").classList.add("hidden");
  $("authScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

// Tab switching
$("tabLogin").addEventListener("click", () => switchAuthTab("login"));
$("tabSignup").addEventListener("click", () => switchAuthTab("signup"));
function switchAuthTab(which) {
  const login = which === "login";
  $("tabLogin").classList.toggle("active", login);
  $("tabSignup").classList.toggle("active", !login);
  $("loginForm").classList.toggle("hidden", !login);
  $("signupForm").classList.toggle("hidden", login);
  $("loginError").classList.add("hidden");
  $("signupError").classList.add("hidden");
}

// Password visibility toggle
document.querySelectorAll(".toggle-pw").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = $(btn.dataset.target);
    const icon = btn.querySelector("i");
    if (input.type === "password") { input.type = "text"; icon.className = "fa-solid fa-eye-slash"; }
    else { input.type = "password"; icon.className = "fa-solid fa-eye"; }
  });
});

// Password strength
$("signupPassword").addEventListener("input", (e) => {
  const v = e.target.value;
  const bar = $("pwStrength");
  if (!v) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  let score = 0;
  if (v.length >= 6) score++;
  if (v.length >= 10) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v) || /[^A-Za-z0-9]/.test(v)) score++;
  const colors = ["#ef4444", "#f59e0b", "#f59e0b", "#22c55e", "#22c55e"];
  const labels = ["Weak", "Fair", "Fair", "Good", "Strong"];
  $("pwBarFill").style.width = `${(score / 4) * 100}%`;
  $("pwBarFill").style.background = colors[score];
  $("pwLabel").textContent = labels[score];
  $("pwLabel").style.color = colors[score];
});

// Avatar presets
const presetsBox = $("avatarPresets");
AVATAR_PRESETS.forEach((emoji) => {
  const b = el("div", "preset", emoji);
  b.addEventListener("click", () => {
    document.querySelectorAll(".preset").forEach((p) => p.classList.remove("selected"));
    b.classList.add("selected");
    state.selectedAvatar = emoji;
    $("avatarPreview").innerHTML = emoji;
    $("avatarPreview").style.fontSize = "1.6rem";
  });
  presetsBox.appendChild(b);
});
$("signupAvatarFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.selectedAvatar = reader.result;
    $("avatarPreview").innerHTML = `<img src="${reader.result}" alt="" />`;
    document.querySelectorAll(".preset").forEach((p) => p.classList.remove("selected"));
  };
  reader.readAsDataURL(file);
});

// Signup
$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("signupError");
  errEl.classList.add("hidden");
  const fullName = $("signupName").value.trim();
  const username = $("signupUsername").value.trim().toLowerCase().replace(/\s+/g, "");
  const email = $("signupEmail").value.trim();
  const password = $("signupPassword").value;
  if (!fullName || !username || !email || !password) { showAuthError(errEl, "Please fill in all fields."); return; }
  if (password.length < 6) { showAuthError(errEl, "Password must be at least 6 characters."); return; }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Creating...";
  try {
    // Check username uniqueness
    const { data: existing } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
    if (existing) { showAuthError(errEl, "That username is taken."); return; }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { showAuthError(errEl, friendlyAuthError(error.message)); return; }
    if (!data.user) { showAuthError(errEl, "Sign-up failed. Please try again."); return; }

    // Insert profile
    const avatarUrl = state.selectedAvatar && state.selectedAvatar.startsWith("data:") ? state.selectedAvatar : null;
    const avatarEmoji = state.selectedAvatar && !state.selectedAvatar.startsWith("data:") ? state.selectedAvatar : null;
    await supabase.from("profiles").insert({
      id: data.user.id,
      full_name: fullName,
      username,
      avatar_url: avatarUrl,
      avatar_emoji: avatarEmoji,
      bio: "Hey there! I'm on NUVORA.",
    });
    // signInWithPassword not needed — signUp returns a session when email confirmation is off
    if (data.session) {
      await initApp(data.user, data.session);
    } else {
      // Fallback: sign in
      await supabase.auth.signInWithPassword({ email, password });
    }
  } catch (err) {
    showAuthError(errEl, err.message || "Something went wrong.");
  } finally {
    btn.disabled = false; btn.textContent = "Create Account";
  }
});

// Login
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("loginError");
  errEl.classList.add("hidden");
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Logging in...";
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { showAuthError(errEl, friendlyAuthError(error.message)); return; }
    await initApp(data.user, data.session);
  } catch (err) {
    showAuthError(errEl, err.message || "Login failed.");
  } finally {
    btn.disabled = false; btn.textContent = "Log In";
  }
});

function showAuthError(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }
function friendlyAuthError(msg) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Invalid email or password.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a moment.";
  return msg;
}

// ============================================================
// SESSION / INIT
// ============================================================

supabase.auth.onAuthStateChange((event, session) => {
  (async () => {
    if (event === "SIGNED_OUT") { cleanup(); showAuth(); return; }
    if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session && session.user) {
      await initApp(session.user, session);
    }
  })();
});

async function initApp(user, session) {
  state.user = user;
  // Load own profile
  let { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) {
    // Create profile if missing (e.g. user exists in auth but not profiles)
    const username = (user.email || "user").split("@")[0];
    const { data: inserted } = await supabase.from("profiles").insert({
      id: user.id, full_name: username, username, bio: "Hey there! I'm on NUVORA.",
    }).select().single();
    profile = inserted;
  }
  state.profile = profile;
  state.settings = Object.assign(state.settings, loadSettings());
  applyTheme(loadTheme());
  showApp();
  renderProfile();
  setupPresence();
  await loadProfiles();
  await loadChats();
  setupRealtime();
  switchView("chats");
}

function cleanup() {
  state.subscriptions.forEach((s) => { try { s.unsubscribe(); } catch (_) {} });
  state.subscriptions = [];
  state.chats.clear();
  state.messages.clear();
  state.profiles.clear();
  state.activeChatId = null;
  state.user = null;
  state.profile = null;
  $("chatList").innerHTML = "";
  $("messages").innerHTML = "";
}

// ============================================================
// PRESENCE
// ============================================================

function setupPresence() {
  // Mark online now, and set up a heartbeat. On unload, mark offline.
  const setOnline = () => supabase.from("profiles").update({ is_online: true, last_seen: new Date().toISOString() }).eq("id", state.user.id);
  const setOffline = () => {
    // best-effort; use fetch with beacon-like pattern
    supabase.from("profiles").update({ is_online: false, last_seen: new Date().toISOString() }).eq("id", state.user.id);
  };
  setOnline();
  window.addEventListener("beforeunload", setOffline);
  // Heartbeat every 25s
  setInterval(setOnline, 25000);
  // Listen for profile changes (presence + bio updates)
  const ch = supabase.channel("profiles-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
      const p = payload.new;
      if (state.profiles.has(p.id)) { state.profiles.set(p.id, p); }
      if (p.id === state.user.id) state.profile = p;
      renderPeople();
      renderChatList();
      updateChatHeader();
    })
    .subscribe();
  state.subscriptions.push(ch);
}

// ============================================================
// PROFILES (people directory)
// ============================================================

async function loadProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").neq("id", state.user.id);
  if (error) { console.error(error); return; }
  (data || []).forEach((p) => state.profiles.set(p.id, p));
}

function renderPeople() {
  const grid = $("peopleGrid");
  grid.innerHTML = "";
  const q = ($("peopleSearch").value || "").toLowerCase().trim();
  const list = [...state.profiles.values()]
    .filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q))
    .sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0) || a.full_name.localeCompare(b.full_name));
  if (list.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-3);grid-column:1/-1;text-align:center;padding:40px;">No people found. Invite someone to join NUVORA!</p>`;
    return;
  }
  list.forEach((p) => {
    const card = el("div", "person-card");
    const avatarInner = p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" alt=""/>` : escapeHtml(avatarEmoji(p));
    card.innerHTML = `
      <div class="person-avatar" style="${avatarBg(p)}">${avatarInner}<span class="dot ${p.is_online ? "online" : "offline"}"></span></div>
      <div class="person-name">${escapeHtml(p.full_name)}</div>
      <div class="person-username">@${escapeHtml(p.username)}</div>
      <div class="person-status">${p.is_online ? "Online" : "Last seen " + fmtLastSeen(p.last_seen)}</div>
      <button class="person-msg-btn">Message</button>
    `;
    card.querySelector(".person-msg-btn").addEventListener("click", (e) => { e.stopPropagation(); openChatWith(p.id); });
    card.addEventListener("click", () => openChatWith(p.id));
    grid.appendChild(card);
  });
}

function avatarEmoji(p) { return (p && p.avatar_emoji) || "🙂"; }

$("peopleSearch").addEventListener("input", renderPeople);

// ============================================================
// CHATS — loading, listing, opening
// ============================================================

async function loadChats() {
  // Get chats I'm a member of
  const { data: memberships, error } = await supabase.from("chat_members").select("chat_id").eq("user_id", state.user.id);
  if (error || !memberships) return;
  const ids = memberships.map((m) => m.chat_id);
  if (ids.length === 0) { renderChatList(); return; }
  const { data: chats } = await supabase.from("chats").select("*").in("id", ids);
  (chats || []).forEach((c) => state.chats.set(c.id, c));
  // Load last message for each chat
  for (const c of chats || []) {
    await loadLastMessage(c.id);
  }
  renderChatList();
}

async function loadLastMessage(chatId) {
  const { data } = await supabase.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: false }).limit(1);
  if (data && data[0]) {
    const chat = state.chats.get(chatId) || {};
    chat.lastMessage = data[0];
    state.chats.set(chatId, chat);
  }
}

function renderChatList() {
  const list = $("chatList");
  list.innerHTML = "";
  const q = ($("sidebarSearch").value || "").toLowerCase().trim();

  // NUVO pinned chat first
  const nuvoItem = el("div", "chat-item pinned");
  nuvoItem.innerHTML = `
    <div class="chat-item-avatar" style="background:var(--grad)"><i class="fa-solid fa-robot"></i></div>
    <div class="chat-item-body">
      <div class="chat-item-row"><span class="chat-item-name">NUVO</span></div>
      <div class="chat-item-preview">Your AI assistant — ask me anything</div>
    </div>
  `;
  nuvoItem.addEventListener("click", () => openNuvoChat());
  if (state.activeChatId === NUVO_ID) nuvoItem.classList.add("active");
  list.appendChild(nuvoItem);

  // Other chats sorted by last message time
  const chats = [...state.chats.values()]
    .filter((c) => !q || chatDisplayName(c).toLowerCase().includes(q))
    .sort((a, b) => {
      const at = (a.lastMessage && a.lastMessage.created_at) || a.created_at || 0;
      const bt = (b.lastMessage && b.lastMessage.created_at) || b.created_at || 0;
      return new Date(bt) - new Date(at);
    });

  for (const c of chats) {
    const other = isGroup(c) ? null : otherMember(c);
    const name = chatDisplayName(c);
    const avatar = isGroup(c)
      ? `<div class="chat-item-avatar" style="background:var(--grad)"><i class="fa-solid fa-users"></i></div>`
      : `<div class="chat-item-avatar" style="${avatarBg(other)}">${other && other.avatar_url ? `<img src="${escapeHtml(other.avatar_url)}"/>` : escapeHtml(avatarEmoji(other))}</div>`;
    const last = c.lastMessage;
    const preview = last ? (last.deleted_for_all ? "🚫 Message deleted" : (last.sender_id === state.user.id ? "You: " : "") + escapeHtml(last.content).slice(0, 50)) : "No messages yet";
    const time = last ? fmtTime(last.created_at) : "";
    const unread = c.unread || 0;
    const item = el("div", "chat-item");
    item.innerHTML = `
      ${avatar}
      <div class="chat-item-body">
        <div class="chat-item-row"><span class="chat-item-name">${escapeHtml(name)}</span><span class="chat-item-time">${time}</span></div>
        <div class="chat-item-preview">${preview}</div>
      </div>
      ${unread ? `<span class="chat-item-badge">${unread}</span>` : ""}
    `;
    item.addEventListener("click", () => openChat(c.id));
    if (state.activeChatId === c.id) item.classList.add("active");
    list.appendChild(item);
  }
}

$("sidebarSearch").addEventListener("input", renderChatList);

function isGroup(c) { return c && c.is_group; }
function otherMember(c) {
  // For 1-on-1, find the other member's profile
  // We need chat_members to know members; we cache them on the chat object
  const members = c._members || [];
  const otherId = members.find((m) => m !== state.user.id);
  return state.profiles.get(otherId) || { id: otherId, full_name: "User", username: "user", avatar_emoji: "🙂" };
}
function chatDisplayName(c) {
  if (isGroup(c)) return c.group_name || "Group";
  const o = otherMember(c);
  return o ? o.full_name : "Chat";
}

// ---------- Open / start chats ----------

async function openChatWith(userId) {
  // Find existing 1-on-1 chat with this user
  const { data: myMembers } = await supabase.from("chat_members").select("chat_id").eq("user_id", state.user.id);
  if (myMembers && myMembers.length) {
    for (const m of myMembers) {
      const { data: members } = await supabase.from("chat_members").select("user_id").eq("chat_id", m.chat_id);
      const ids = (members || []).map((x) => x.user_id);
      if (ids.length === 2 && ids.includes(userId)) {
        const chat = state.chats.get(m.chat_id) || { id: m.chat_id };
        chat._members = ids;
        state.chats.set(m.chat_id, chat);
        openChat(m.chat_id);
        return;
      }
    }
  }
  // Create new chat
  const { data: chat } = await supabase.from("chats").insert({ is_group: false, created_by: state.user.id }).select().single();
  if (!chat) { toast("Could not start chat."); return; }
  await supabase.from("chat_members").insert([{ chat_id: chat.id, user_id: state.user.id }, { chat_id: chat.id, user_id: userId }]);
  chat._members = [state.user.id, userId];
  state.chats.set(chat.id, chat);
  openChat(chat.id);
  switchView("chats");
}

async function openChat(chatId) {
  state.activeChatId = chatId;
  const c = state.chats.get(chatId);
  if (!c._members) {
    const { data: members } = await supabase.from("chat_members").select("user_id").eq("chat_id", chatId);
    c._members = (members || []).map((m) => m.user_id);
  }
  // Load messages
  await loadMessages(chatId);
  // Mark read
  await markRead(chatId);
  renderChatList();
  switchView("chats");
  showChatPanel();
  renderMessages();
  updateChatHeader();
  subscribeToMessages(chatId);
  subscribeToTyping(chatId);
}

async function loadMessages(chatId) {
  const { data } = await supabase.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(200);
  state.messages.set(chatId, data || []);
  // Load reactions for these messages
  if (data && data.length) {
    const ids = data.map((m) => m.id);
    const { data: reacts } = await supabase.from("reactions").select("*").in("message_id", ids);
    const rmap = new Map();
    (reacts || []).forEach((r) => {
      if (!rmap.has(r.message_id)) rmap.set(r.message_id, []);
      rmap.get(r.message_id).push(r);
    });
    state.messages.set(chatId, (data || []).map((m) => ({ ...m, reactions: rmap.get(m.id) || [] })));
  }
}

// ---------- NUVO chat (local, not in DB) ----------

let nuvoMessages = [];

function openNuvoChat() {
  state.activeChatId = NUVO_ID;
  switchView("chats");
  showChatPanel();
  renderNuvoMessages();
  updateNuvoHeader();
  renderChatList();
}

function renderNuvoMessages() {
  const box = $("messages");
  box.innerHTML = "";
  if (nuvoMessages.length === 0) {
    nuvoMessages.push({ role: "nuvo", content: "Hi! I'm NUVO, your AI assistant. Ask me anything — questions, writing help, translations, jokes, or just chat!", created_at: new Date().toISOString() });
  }
  nuvoMessages.forEach((m) => {
    const row = el("div", "msg-row " + (m.role === "me" ? "me" : "them"));
    const avatar = m.role === "nuvo"
      ? `<div class="msg-avatar" style="background:var(--grad)"><i class="fa-solid fa-robot"></i></div>`
      : `<div class="msg-avatar" style="${avatarBg(state.profile)}">${state.profile && state.profile.avatar_url ? `<img src="${escapeHtml(state.profile.avatar_url)}"/>` : escapeHtml(avatarEmoji(state.profile))}</div>`;
    row.innerHTML = `${avatar}<div class="msg-bubble">${formatContent(m.content)}<div class="msg-meta">${fmtTime(m.created_at)}</div></div>`;
    box.appendChild(row);
  });
  box.scrollTop = box.scrollHeight;
}

function formatContent(text) {
  // basic markdown: **bold**, `code`, ```code blocks```
  let html = escapeHtml(text);
  html = html.replace(/```([\s\S]*?)```/g, (_, c) => `<pre style="background:rgba(0,0,0,.2);padding:8px;border-radius:8px;overflow-x:auto;margin:4px 0;font-size:.82rem">${c}</pre>`);
  html = html.replace(/`([^`]+)`/g, (_, c) => `<code style="background:rgba(0,0,0,.2);padding:1px 5px;border-radius:4px;font-size:.85em">${c}</code>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  html = html.replace(/\n/g, "<br>");
  return html;
}

async function sendNuvoMessage(text) {
  nuvoMessages.push({ role: "me", content: text, created_at: new Date().toISOString() });
  renderNuvoMessages();
  // Thinking indicator
  showNuvoTyping(true);
  const reply = await window.NUVO.respond(text, { onThinking: () => {} });
  showNuvoTyping(false);
  nuvoMessages.push({ role: "nuvo", content: reply, created_at: new Date().toISOString() });
  renderNuvoMessages();
  playSound();
  updateTabBadge();
}

function showNuvoTyping(show) {
  const box = $("messages");
  const existing = box.querySelector(".nuvo-typing");
  if (existing) existing.remove();
  if (!show) return;
  const row = el("div", "msg-row them nuvo-typing");
  row.innerHTML = `<div class="msg-avatar" style="background:var(--grad)"><i class="fa-solid fa-robot"></i></div><div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function updateNuvoHeader() {
  $("chatHeaderName").textContent = "NUVO";
  $("chatHeaderStatus").textContent = "AI Assistant";
  $("chatHeaderStatus").className = "chat-header-status";
  $("chatHeaderAvatar").innerHTML = `<div style="background:var(--grad);width:100%;height:100%;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-robot"></i></div>`;
}

// ============================================================
// REALTIME MESSAGING
// ============================================================

function setupRealtime() {
  // Listen for new chats I'm added to (via chat_members insert)
  const ch = supabase.channel("member-changes")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_members" }, async (payload) => {
      if (payload.new.user_id === state.user.id) {
        const { data: chat } = await supabase.from("chats").select("*").eq("id", payload.new.chat_id).maybeSingle();
        if (chat && !state.chats.has(chat.id)) {
          state.chats.set(chat.id, chat);
          await loadLastMessage(chat.id);
          renderChatList();
        }
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_members" }, async (payload) => {
      // read cursor updated — re-render to update ticks
      if (state.activeChatId === payload.new.chat_id) {
        await refreshCursors(payload.new.chat_id);
        renderMessages();
      }
    })
    .subscribe();
  state.subscriptions.push(ch);
}

function subscribeToMessages(chatId) {
  // Remove old message subscription for other chats
  state.subscriptions = state.subscriptions.filter((s) => { if (s._topic && s._topic.startsWith("msg-")) { try { s.unsubscribe(); } catch (_) {} return false; } return true; });
  const ch = supabase.channel("msg-" + chatId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, async (payload) => {
      const m = payload.new;
      // fetch reactions (none yet for new message)
      m.reactions = [];
      const list = state.messages.get(chatId) || [];
      if (!list.find((x) => x.id === m.id)) {
        list.push(m);
        state.messages.set(chatId, list);
        if (state.activeChatId === chatId) {
          renderMessages();
          // If I'm the receiver and chat is open, mark delivered + read
          if (m.sender_id !== state.user.id) {
            markRead(chatId);
            playSound();
          }
        }
        // Update chat list preview
        const c = state.chats.get(chatId);
        if (c) { c.lastMessage = m; renderChatList(); }
        if (m.sender_id !== state.user.id) { updateTabBadge(); }
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
      const m = payload.new;
      const list = state.messages.get(chatId) || [];
      const idx = list.findIndex((x) => x.id === m.id);
      if (idx >= 0) { list[idx] = { ...list[idx], ...m }; state.messages.set(chatId, list); if (state.activeChatId === chatId) renderMessages(); }
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
      const list = (state.messages.get(chatId) || []).filter((x) => x.id !== payload.old.id);
      state.messages.set(chatId, list);
      if (state.activeChatId === chatId) renderMessages();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, async (payload) => {
      // Re-render reactions — simplest: reload reactions for active chat
      if (state.activeChatId === chatId) { await loadMessages(chatId); renderMessages(); }
    })
    .subscribe();
  ch._topic = "msg-" + chatId;
  state.subscriptions.push(ch);
}

function subscribeToTyping(chatId) {
  // Use a dedicated broadcast channel for typing indicators
  const ch = supabase.channel("typing-" + chatId);
  ch.on("broadcast", { event: "typing" }, (payload) => {
    if (payload && payload.userId !== state.user.id) showTypingIndicator(chatId, payload.name || "Someone");
  }).on("broadcast", { event: "stop" }, (payload) => {
    if (payload && payload.userId !== state.user.id) hideTypingIndicator(chatId);
  }).subscribe();
  ch._topic = "typing-" + chatId;
  state.subscriptions.push(ch);
}

function broadcastTyping(chatId) {
  const ch = state.subscriptions.find((s) => s._topic === "typing-" + chatId);
  if (!ch) return;
  ch.send({ type: "broadcast", event: "typing", payload: { userId: state.user.id, name: state.profile.full_name } });
  clearTimeout(state.typingTimers.get(chatId));
  state.typingTimers.set(chatId, setTimeout(() => {
    ch.send({ type: "broadcast", event: "stop", payload: { userId: state.user.id } });
  }, 3000));
}

function showTypingIndicator(chatId, name) {
  if (!state.settings.typing) return;
  if (state.activeChatId !== chatId) return;
  const box = $("messages");
  let t = box.querySelector(".typing-row");
  if (t) return;
  t = el("div", "typing-row");
  t.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div><span class="typing-text">${escapeHtml(name)} is typing...</span>`;
  box.appendChild(t);
  box.scrollTop = box.scrollHeight;
  clearTimeout(state.typingTimers.get(chatId + "-hide"));
  state.typingTimers.set(chatId + "-hide", setTimeout(() => hideTypingIndicator(chatId), 3000));
}
function hideTypingIndicator(chatId) {
  const box = $("messages");
  const t = box.querySelector(".typing-row");
  if (t) t.remove();
}

// ============================================================
// RENDER MESSAGES
// ============================================================

function renderMessages() {
  const box = $("messages");
  box.innerHTML = "";
  const chatId = state.activeChatId;
  if (chatId === NUVO_ID) { renderNuvoMessages(); return; }
  const list = state.messages.get(chatId) || [];
  let lastDate = "";
  list.forEach((m) => {
    const d = fmtDateSep(m.created_at);
    if (d !== lastDate) {
      const sep = el("div", "date-sep", `<span>${d}</span>`);
      box.appendChild(sep);
      lastDate = d;
    }
    const mine = m.sender_id === state.user.id;
    const row = el("div", "msg-row " + (mine ? "me" : "them"));
    row.dataset.id = m.id;
    const sender = state.profiles.get(m.sender_id) || (state.profile && state.profile.id === m.sender_id ? state.profile : { full_name: "User", avatar_emoji: "🙂" });
    const avatar = mine
      ? `<div class="msg-avatar" style="${avatarBg(state.profile)}">${state.profile && state.profile.avatar_url ? `<img src="${escapeHtml(state.profile.avatar_url)}"/>` : escapeHtml(avatarEmoji(state.profile))}</div>`
      : `<div class="msg-avatar" style="${avatarBg(sender)}">${sender && sender.avatar_url ? `<img src="${escapeHtml(sender.avatar_url)}"/>` : escapeHtml(avatarEmoji(sender))}</div>`;
    let replyHtml = "";
    if (m.reply_to) {
      const orig = list.find((x) => x.id === m.reply_to);
      if (orig) {
        const origSender = orig.sender_id === state.user.id ? "You" : (state.profiles.get(orig.sender_id) || {}).full_name || "User";
        replyHtml = `<div class="msg-reply-quote"><div class="quote-name">${escapeHtml(origSender)}</div>${escapeHtml(orig.content).slice(0, 80)}</div>`;
      }
    }
    const content = m.deleted_for_all ? `<span class="msg-deleted">🚫 This message was deleted</span>` : formatContent(m.content);
    const ticks = renderTicks(m, mine);
    const reactionsHtml = (m.reactions && m.reactions.length) ? `<div class="msg-reactions">${m.reactions.map((r) => `<span class="msg-reaction">${r.emoji}</span>`).join("")}</div>` : "";
    row.innerHTML = `${avatar}<div><div class="msg-bubble">${replyHtml}${content}<div class="msg-meta">${fmtTime(m.created_at)} ${ticks}</div></div>${reactionsHtml}</div>`;
    // Context menu triggers
    row.querySelector(".msg-bubble").addEventListener("contextmenu", (e) => { e.preventDefault(); openCtxMenu(e, m); });
    row.querySelector(".msg-bubble").addEventListener("touchstart", (e) => { longPressTimer = setTimeout(() => { openCtxMenu({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }, m); }, 500); });
    row.querySelector(".msg-bubble").addEventListener("touchend", () => clearTimeout(longPressTimer));
    row.querySelector(".msg-bubble").addEventListener("touchmove", () => clearTimeout(longPressTimer));
    box.appendChild(row);
  });
  box.scrollTop = box.scrollHeight;
}

let longPressTimer = null;

function renderTicks(m, mine) {
  if (!mine || m.deleted_for_all) return "";
  const chatId = state.activeChatId;
  const c = state.chats.get(chatId);
  const members = (c && c._members) || [];
  const others = members.filter((id) => id !== state.user.id);
  // Check read cursors of other members — we need their last_read_at
  // For simplicity, compare against m.created_at using cached member cursors
  const readByAll = others.every((uid) => {
    const cursor = (c._cursors && c._cursors[uid]) || 0;
    return new Date(cursor) >= new Date(m.created_at);
  });
  if (readByAll) return `<i class="fa-solid fa-check-double msg-tick read"></i>`;
  const delivered = others.length > 0;
  return delivered ? `<i class="fa-solid fa-check-double msg-tick"></i>` : `<i class="fa-solid fa-check msg-tick"></i>`;
}

// ============================================================
// READ RECEIPTS / DELIVERED
// ============================================================

async function markRead(chatId) {
  if (chatId === NUVO_ID) return;
  const now = new Date().toISOString();
  await supabase.from("chat_members").update({ last_read_at: now, last_delivered_at: now }).eq("chat_id", chatId).eq("user_id", state.user.id);
  // Fetch other members' cursors to compute ticks
  await refreshCursors(chatId);
}

async function refreshCursors(chatId) {
  const { data } = await supabase.from("chat_members").select("user_id, last_read_at").eq("chat_id", chatId);
  const c = state.chats.get(chatId);
  if (!c) return;
  c._cursors = {};
  (data || []).forEach((m) => { c._cursors[m.user_id] = m.last_read_at; });
}

// ============================================================
// SENDING MESSAGES
// ============================================================

const messageInput = $("messageInput");
const sendBtn = $("sendBtn");

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
messageInput.addEventListener("input", () => {
  autoGrow(messageInput);
  if (state.activeChatId && state.activeChatId !== NUVO_ID) broadcastTyping(state.activeChatId);
});

function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = "";
  autoGrow(messageInput);
  const chatId = state.activeChatId;
  if (chatId === NUVO_ID) { await sendNuvoMessage(text); return; }
  const replyTo = state.replyTo;
  state.replyTo = null;
  hideReplyPreview();
  const { data } = await supabase.from("messages").insert({
    chat_id: chatId,
    sender_id: state.user.id,
    content: text,
    reply_to: replyTo || null,
  }).select().single();
  if (data) {
    const list = state.messages.get(chatId) || [];
    list.push({ ...data, reactions: [] });
    state.messages.set(chatId, list);
    renderMessages();
    const c = state.chats.get(chatId);
    if (c) { c.lastMessage = data; renderChatList(); }
  }
}

// ============================================================
// EMOJI PANEL
// ============================================================

const emojiPanel = $("emojiPanel");
EMOJIS.forEach((e) => {
  const b = el("button", "emoji-btn", e);
  b.addEventListener("click", () => {
    messageInput.value += e;
    messageInput.focus();
    autoGrow(messageInput);
  });
  emojiPanel.appendChild(b);
});
$("emojiBtn").addEventListener("click", () => emojiPanel.classList.toggle("hidden"));
document.addEventListener("click", (e) => {
  if (!emojiPanel.classList.contains("hidden") && !emojiPanel.contains(e.target) && e.target.id !== "emojiBtn" && !e.target.closest("#emojiBtn")) {
    emojiPanel.classList.add("hidden");
  }
});

// ============================================================
// CONTEXT MENU (reactions, reply, copy, delete)
// ============================================================

const ctxMenu = $("ctxMenu");
function openCtxMenu(e, msg) {
  ctxMenu.innerHTML = "";
  // Reactions row
  const reactRow = el("div", "ctx-reactions");
  REACTION_EMOJIS.forEach((emoji) => {
    const b = el("button", "react-btn", emoji);
    b.addEventListener("click", () => { toggleReaction(msg.id, emoji); closeCtxMenu(); });
    reactRow.appendChild(b);
  });
  ctxMenu.appendChild(reactRow);
  // Items
  const items = [
    { icon: "fa-reply", label: "Reply", action: () => setReplyTo(msg) },
    { icon: "fa-copy", label: "Copy", action: () => { navigator.clipboard.writeText(msg.content); toast("Copied"); } },
  ];
  if (msg.sender_id === state.user.id && !msg.deleted_for_all) {
    items.push({ icon: "fa-trash", label: "Delete for everyone", danger: true, action: () => deleteMessage(msg.id, true) });
  }
  items.push({ icon: "fa-trash-can", label: "Delete for me", danger: true, action: () => deleteMessage(msg.id, false) });
  items.forEach((it) => {
    const b = el("button", "ctx-item" + (it.danger ? " danger" : ""), `<i class="fa-solid ${it.icon}"></i> ${it.label}`);
    b.addEventListener("click", () => { it.action(); closeCtxMenu(); });
    ctxMenu.appendChild(b);
  });
  ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 200) + "px";
  ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 240) + "px";
  ctxMenu.classList.remove("hidden");
}
function closeCtxMenu() { ctxMenu.classList.add("hidden"); }
document.addEventListener("click", (e) => { if (!ctxMenu.contains(e.target)) closeCtxMenu(); });

async function toggleReaction(messageId, emoji) {
  const { data: existing } = await supabase.from("reactions").select("emoji").eq("message_id", messageId).eq("user_id", state.user.id).maybeSingle();
  if (existing) {
    if (existing.emoji === emoji) {
      await supabase.from("reactions").delete().eq("message_id", messageId).eq("user_id", state.user.id);
    } else {
      await supabase.from("reactions").update({ emoji }).eq("message_id", messageId).eq("user_id", state.user.id);
    }
  } else {
    await supabase.from("reactions").insert({ message_id: messageId, user_id: state.user.id, emoji });
  }
  await loadMessages(state.activeChatId);
  renderMessages();
}

async function deleteMessage(messageId, forAll) {
  if (forAll) {
    await supabase.from("messages").update({ deleted_for_all: true, content: "" }).eq("id", messageId);
  } else {
    // "Delete for me" — just remove from local view (simplest approach without a per-user delete table)
    const list = (state.messages.get(state.activeChatId) || []).filter((m) => m.id !== messageId);
    state.messages.set(state.activeChatId, list);
  }
  await loadMessages(state.activeChatId);
  renderMessages();
  toast(forAll ? "Deleted for everyone" : "Deleted for you");
}

// ---------- Reply preview ----------

function setReplyTo(msg) {
  state.replyTo = msg.id;
  const sender = msg.sender_id === state.user.id ? "You" : (state.profiles.get(msg.sender_id) || {}).full_name || "User";
  $("replyPreview").querySelector(".reply-preview-content").innerHTML = `<b>${escapeHtml(sender)}</b><br>${escapeHtml(msg.content).slice(0, 80)}`;
  $("replyPreview").classList.remove("hidden");
  messageInput.focus();
}
$("replyPreviewClose").addEventListener("click", () => { state.replyTo = null; hideReplyPreview(); });
function hideReplyPreview() { $("replyPreview").classList.add("hidden"); }

// ============================================================
// CHAT HEADER / SEARCH
// ============================================================

function updateChatHeader() {
  const chatId = state.activeChatId;
  if (chatId === NUVO_ID) { updateNuvoHeader(); return; }
  const c = state.chats.get(chatId);
  if (!c) return;
  const name = chatDisplayName(c);
  $("chatHeaderName").textContent = name;
  if (isGroup(c)) {
    $("chatHeaderStatus").textContent = (c._members || []).length + " members";
    $("chatHeaderStatus").className = "chat-header-status";
    $("chatHeaderAvatar").innerHTML = `<div style="background:var(--grad);width:100%;height:100%;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-users"></i></div>`;
  } else {
    const o = otherMember(c);
    $("chatHeaderStatus").textContent = o && o.is_online ? "Online" : "Last seen " + fmtLastSeen(o && o.last_seen);
    $("chatHeaderStatus").className = "chat-header-status " + (o && o.is_online ? "online" : "");
    $("chatHeaderAvatar").style.cssText = avatarBg(o);
    $("chatHeaderAvatar").innerHTML = o && o.avatar_url ? `<img src="${escapeHtml(o.avatar_url)}"/>` : escapeHtml(avatarEmoji(o));
  }
}

// Chat search
$("chatSearchBtn").addEventListener("click", () => $("chatSearchBar").classList.toggle("hidden"));
$("chatSearchClose").addEventListener("click", () => { $("chatSearchBar").classList.add("hidden"); $("chatSearchInput").value = ""; renderMessages(); });
$("chatSearchInput").addEventListener("input", () => {
  const q = $("chatSearchInput").value.toLowerCase().trim();
  document.querySelectorAll(".msg-row").forEach((row) => {
    const text = row.textContent.toLowerCase();
    row.style.display = (!q || text.includes(q)) ? "" : "none";
    if (q && text.includes(q)) row.classList.add("msg-highlight");
    else row.classList.remove("msg-highlight");
  });
});

// Back button (mobile)
$("chatBackBtn").addEventListener("click", () => { hideChatPanel(); });

function showChatPanel() { document.body.querySelector(".app").classList.add("show-chat"); }
function hideChatPanel() { document.body.querySelector(".app").classList.remove("show-chat"); state.activeChatId = null; renderChatList(); }

// ============================================================
// VIEWS / NAVIGATION
// ============================================================

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("emptyState").classList.toggle("hidden", view !== "chats" || state.activeChatId !== null);
  $("peopleView").classList.toggle("hidden", view !== "people");
  $("profileView").classList.toggle("hidden", view !== "profile");
  $("settingsView").classList.toggle("hidden", view !== "settings");
  $("chatView").classList.toggle("hidden", view !== "chats" || state.activeChatId === null);
  if (view === "people") renderPeople();
  if (view === "profile") renderProfile();
  if (view === "chats" && state.activeChatId) { $("emptyState").classList.add("hidden"); $("chatView").classList.remove("hidden"); }
  if (view === "chats" && !state.activeChatId) { $("chatView").classList.add("hidden"); $("emptyState").classList.remove("hidden"); }
}

// ============================================================
// PROFILE
// ============================================================

function renderProfile() {
  if (!state.profile) return;
  $("profileName").textContent = state.profile.full_name;
  $("profileUsername").textContent = "@" + state.profile.username;
  const av = $("profileAvatar");
  av.style.cssText = avatarBg(state.profile);
  av.innerHTML = state.profile.avatar_url ? `<img src="${escapeHtml(state.profile.avatar_url)}"/>` : escapeHtml(avatarEmoji(state.profile));
  $("profileBio").value = state.profile.bio || "";
  // Stats
  $("profileStats").innerHTML = `
    <div class="stat"><div class="stat-num">${state.chats.size}</div><div class="stat-label">Chats</div></div>
    <div class="stat"><div class="stat-num">${state.profiles.size}</div><div class="stat-label">People</div></div>
  `;
}

$("saveBioBtn").addEventListener("click", async () => {
  const bio = $("profileBio").value.trim();
  await supabase.from("profiles").update({ bio }).eq("id", state.user.id);
  state.profile.bio = bio;
  toast("Status updated");
});

$("editAvatarBtn").addEventListener("click", () => $("profileAvatarFile").click());
$("profileAvatarFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    await supabase.from("profiles").update({ avatar_url: dataUrl }).eq("id", state.user.id);
    state.profile.avatar_url = dataUrl;
    renderProfile();
    renderChatList();
    toast("Photo updated");
  };
  reader.readAsDataURL(file);
});

$("logoutBtn").addEventListener("click", () => {
  openModal({
    title: "Log out?",
    body: "<p style='color:var(--text-2);margin-bottom:8px'>You'll need to log in again to access NUVORA.</p>",
    confirmText: "Log out",
    onConfirm: async () => { await supabase.auth.signOut(); closeModal(); },
  });
});

$("settingsBtn").addEventListener("click", () => switchView("settings"));
$("settingsBack").addEventListener("click", () => switchView("profile"));

// ============================================================
// SETTINGS
// ============================================================

$("themeToggle").addEventListener("click", () => toggleTheme());
document.querySelectorAll(".seg-btn").forEach((b) => {
  b.addEventListener("click", () => { applyTheme(b.dataset.theme); saveTheme(b.dataset.theme); document.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("active", x === b)); });
});
$("notifToggle").addEventListener("change", (e) => { state.settings.sound = e.target.checked; saveSettings(); });
$("typingToggle").addEventListener("change", (e) => { state.settings.typing = e.target.checked; saveSettings(); });
$("receiptsToggle").addEventListener("change", (e) => { state.settings.receipts = e.target.checked; saveSettings(); });

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = $("themeToggle");
  if (btn) {
    btn.querySelector("i").className = theme === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
    btn.querySelector("span").textContent = theme === "dark" ? "Dark mode" : "Light mode";
  }
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  applyTheme(next); saveTheme(next);
  document.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("active", x.dataset.theme === next));
}
function saveTheme(t) { localStorage.setItem("nuvora-theme", t); }
function loadTheme() { return localStorage.getItem("nuvora-theme") || "dark"; }
function saveSettings() { localStorage.setItem("nuvora-settings", JSON.stringify(state.settings)); }
function loadSettings() { try { return JSON.parse(localStorage.getItem("nuvora-settings")) || {}; } catch { return {}; } }

// ============================================================
// NEW CHAT / GROUP MODAL
// ============================================================

$("newChatBtn").addEventListener("click", () => openNewChatModal());

function openNewChatModal() {
  const card = $("modalCard");
  const people = [...state.profiles.values()];
  const selected = new Set();
  card.innerHTML = `
    <h3>Start a new chat</h3>
    <input class="modal-input" id="modalGroupName" placeholder="Group name (optional — leave blank for 1-on-1)" />
    <div class="modal-list" id="modalPeopleList"></div>
    <div class="modal-actions">
      <button class="modal-cancel">Cancel</button>
      <button class="modal-confirm">Create</button>
    </div>
  `;
  const listEl = card.querySelector("#modalPeopleList");
  people.forEach((p) => {
    const row = el("div", "modal-person");
    const avInner = p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}"/>` : escapeHtml(avatarEmoji(p));
    row.innerHTML = `
      <div class="person-avatar" style="width:36px;height:36px;font-size:1rem;${avatarBg(p)}">${avInner}</div>
      <div><div style="font-weight:600;font-size:.9rem">${escapeHtml(p.full_name)}</div><div style="font-size:.78rem;color:var(--text-3)">@${escapeHtml(p.username)}</div></div>
      <i class="fa-solid fa-check check hidden"></i>
    `;
    row.addEventListener("click", () => {
      const check = row.querySelector(".check");
      if (selected.has(p.id)) { selected.delete(p.id); row.classList.remove("selected"); check.classList.add("hidden"); }
      else { selected.add(p.id); row.classList.add("selected"); check.classList.remove("hidden"); }
    });
    listEl.appendChild(row);
  });
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  card.querySelector(".modal-confirm").addEventListener("click", async () => {
    const ids = [...selected];
    if (ids.length === 0) { toast("Select at least one person."); return; }
    const groupName = $("modalGroupName").value.trim();
    if (ids.length === 1 && !groupName) {
      closeModal();
      await openChatWith(ids[0]);
      return;
    }
    const isGroup = !!groupName || ids.length > 1;
    const { data: chat } = await supabase.from("chats").insert({ is_group: isGroup, group_name: groupName || null, created_by: state.user.id }).select().single();
    const members = [{ chat_id: chat.id, user_id: state.user.id }, ...ids.map((id) => ({ chat_id: chat.id, user_id: id }))];
    await supabase.from("chat_members").insert(members);
    chat._members = [state.user.id, ...ids];
    state.chats.set(chat.id, chat);
    closeModal();
    openChat(chat.id);
  });
  $("modal").classList.remove("hidden");
}

function openModal({ title, body, confirmText, onConfirm }) {
  const card = $("modalCard");
  card.innerHTML = `
    <h3>${title}</h3>
    ${body || ""}
    <div class="modal-actions">
      <button class="modal-cancel">Cancel</button>
      <button class="modal-confirm">${confirmText || "OK"}</button>
    </div>
  `;
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  card.querySelector(".modal-confirm").addEventListener("click", () => { if (onConfirm) onConfirm(); });
  $("modal").classList.remove("hidden");
}
function closeModal() { $("modal").classList.add("hidden"); }
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });

// ============================================================
// TAB BADGE / NOTIFICATIONS
// ============================================================

let unreadTotal = 0;
function updateTabBadge() {
  unreadTotal++;
  document.title = `(${unreadTotal}) ${PAGE_TITLE}`;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { unreadTotal = 0; document.title = PAGE_TITLE; }
});

// ============================================================
// BOOT
// ============================================================

(async function boot() {
  applyTheme(loadTheme());
  const { data: { session } } = await supabase.auth.getSession();
  if (session && session.user) {
    await initApp(session.user, session);
  } else {
    setTimeout(() => showAuth(), 1400);
  }
})();
