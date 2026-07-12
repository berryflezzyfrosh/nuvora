// ============================================================
// NUVORA — Main Application Logic (WhatsApp-style features)
// Pure vanilla JavaScript. Uses Supabase via CDN.
// All icons: Boxicons (bx classes).
// ============================================================

import "./supabase-config.js";
const supabase = window.NUVORA_DB;

const NUVO_ID = "00000000-0000-0000-0000-000000000000";
const AVATAR_PRESETS = ["🦊","🐼","🦄","🐙","🦉","🐳","🦋","🌸","⚡","🔥","🌊","🌟"];
const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","❤️","🔥","🎉","✨","💯","🙏","👏","🤝","😅","🤣","😴","🤯","🥳","😱","🤗","🫶","💪","🧠","👀","✅","❌","⭐","🚀","☕","🍕","🎵","🌈","🎮","📱","💻"];
const REACTION_EMOJIS = ["👍","❤️","😂","😮","😢","🙏","🔥","👏"];
const PAGE_TITLE = "NUVORA";

const state = {
  user: null, profile: null, profiles: new Map(), chats: new Map(),
  activeChatId: null, messages: new Map(), subscriptions: [],
  typingTimers: new Map(), settings: { sound: true, typing: true, receipts: true },
  replyTo: null, editTarget: null, selectedAvatar: null, view: "chats",
  starredIds: new Set(), blockedIds: new Set(), archivedChats: new Set(),
  mutedChats: new Set(), nuvoMessages: [], unreadTotal: 0,
};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const fmtTime = (ts) => { try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const fmtDateSep = (ts) => { const d = new Date(ts), t = new Date(), y = new Date(); y.setDate(y.getDate()-1); const f = (x) => x.toLocaleDateString([], { day: "numeric", month: "short" }); if (d.toDateString() === t.toDateString()) return "Today"; if (d.toDateString() === y.toDateString()) return "Yesterday"; return f(d); };
const fmtLastSeen = (ts) => { if (!ts) return "a while ago"; const diff = Date.now() - new Date(ts).getTime(), m = Math.floor(diff/60000); if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; const d = Math.floor(h/24); if (d < 7) return `${d}d ago`; return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" }); };

function avatarContent(p) {
  if (!p) return "<i class='bx bx-user'></i>";
  if (p.avatar_url) return `<img src="${esc(p.avatar_url)}" alt=""/>`;
  if (p.avatar_emoji) return esc(p.avatar_emoji);
  return esc((p.full_name || p.username || "?").charAt(0).toUpperCase());
}
function avatarBg(p) {
  if (p && p.avatar_url) return "";
  const id = (p && p.id) || "x";
  const hue = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `background: linear-gradient(135deg, hsl(${hue},55%,45%), hsl(${(hue+50)%360},55%,35%));`;
}

// ---------- Sound ----------
let audioCtx = null;
function playSound() {
  if (!state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.setValueAtTime(800, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    o.start(); o.stop(audioCtx.currentTime + 0.2);
  } catch {}
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2600); }

// ============================================================
// AUTH
// ============================================================
function showAuth() { $("splash").classList.add("hidden"); $("app").classList.add("hidden"); $("authScreen").classList.remove("hidden"); }
function showApp() { $("splash").classList.add("hidden"); $("authScreen").classList.add("hidden"); $("app").classList.remove("hidden"); }

$("tabLogin").addEventListener("click", () => switchTab("login"));
$("tabSignup").addEventListener("click", () => switchTab("signup"));
function switchTab(w) { const l = w === "login"; $("tabLogin").classList.toggle("active", l); $("tabSignup").classList.toggle("active", !l); $("loginForm").classList.toggle("hidden", !l); $("signupForm").classList.toggle("hidden", l); $("loginError").classList.add("hidden"); $("signupError").classList.add("hidden"); }

document.querySelectorAll(".toggle-pw").forEach((b) => b.addEventListener("click", () => { const i = $(b.dataset.target), ic = b.querySelector("i"); if (i.type === "password") { i.type = "text"; ic.className = "bx bx-hide"; } else { i.type = "password"; ic.className = "bx bx-show"; } }));

$("signupPassword").addEventListener("input", (e) => {
  const v = e.target.value, bar = $("pwStrength");
  if (!v) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  let s = 0; if (v.length >= 6) s++; if (v.length >= 10) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v) || /[^A-Za-z0-9]/.test(v)) s++;
  const colors = ["#ef4444","#f59e0b","#f59e0b","#22c55e","#22c55e"], labels = ["Weak","Fair","Fair","Good","Strong"];
  $("pwBarFill").style.width = `${(s/4)*100}%`;
  $("pwBarFill").style.background = colors[s];
  $("pwLabel").textContent = labels[s];
  $("pwLabel").style.color = colors[s];
});

const presetsBox = $("avatarPresets");
AVATAR_PRESETS.forEach((emoji) => { const b = el("div", "preset", emoji); b.addEventListener("click", () => { document.querySelectorAll(".preset").forEach(p => p.classList.remove("selected")); b.classList.add("selected"); state.selectedAvatar = emoji; $("avatarPreview").innerHTML = emoji; $("avatarPreview").style.fontSize = "1.6rem"; }); presetsBox.appendChild(b); });
$("signupAvatarFile").addEventListener("change", (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { state.selectedAvatar = r.result; $("avatarPreview").innerHTML = `<img src="${r.result}" alt=""/>`; document.querySelectorAll(".preset").forEach(p => p.classList.remove("selected")); }; r.readAsDataURL(f); });

$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("signupError"); err.classList.add("hidden");
  const fullName = $("signupName").value.trim(), username = $("signupUsername").value.trim().toLowerCase().replace(/\s+/g, ""), email = $("signupEmail").value.trim(), password = $("signupPassword").value;
  if (!fullName || !username || !email || !password) { err.textContent = "Please fill in all fields."; err.classList.remove("hidden"); return; }
  if (password.length < 6) { err.textContent = "Password must be at least 6 characters."; err.classList.remove("hidden"); return; }
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Creating...";
  try {
    const { data: existing } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
    if (existing) { err.textContent = "That username is taken."; err.classList.remove("hidden"); return; }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { err.textContent = error.message; err.classList.remove("hidden"); return; }
    if (!data.user) { err.textContent = "Sign-up failed."; err.classList.remove("hidden"); return; }
    const avUrl = state.selectedAvatar && state.selectedAvatar.startsWith("data:") ? state.selectedAvatar : null;
    const avEmoji = state.selectedAvatar && !state.selectedAvatar.startsWith("data:") ? state.selectedAvatar : null;
    await supabase.from("profiles").insert({ id: data.user.id, full_name: fullName, username, avatar_url: avUrl, avatar_emoji: avEmoji, bio: "Hey there! I'm on NUVORA." });
    if (data.session) await initApp(data.user);
    else await supabase.auth.signInWithPassword({ email, password });
  } catch (er) { err.textContent = er.message || "Something went wrong."; err.classList.remove("hidden"); }
  finally { btn.disabled = false; btn.textContent = "Create Account"; }
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("loginError"); err.classList.add("hidden");
  const email = $("loginEmail").value.trim(), password = $("loginPassword").value;
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Logging in...";
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { err.textContent = error.message.includes("Invalid login") ? "Invalid email or password." : error.message; err.classList.remove("hidden"); return; }
    await initApp(data.user);
  } catch (er) { err.textContent = er.message || "Login failed."; err.classList.remove("hidden"); }
  finally { btn.disabled = false; btn.textContent = "Log In"; }
});

// ============================================================
// SESSION
// ============================================================
supabase.auth.onAuthStateChange((event, session) => {
  (async () => {
    if (event === "SIGNED_OUT") { cleanup(); showAuth(); return; }
    if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session && session.user) await initApp(session.user);
  })();
});

async function initApp(user) {
  state.user = user;
  let { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) {
    const uname = (user.email || "user").split("@")[0];
    const { data: ins } = await supabase.from("profiles").insert({ id: user.id, full_name: uname, username: uname, bio: "Hey there! I'm on NUVORA." }).select().single();
    profile = ins;
  }
  state.profile = profile;
  state.settings = Object.assign(state.settings, loadSettings());
  applyTheme(loadTheme());
  showApp();
  renderProfile();
  setupPresence();
  await loadProfiles();
  await loadChats();
  await loadStarred();
  await loadBlocked();
  setupRealtime();
  switchView("chats");
}

function cleanup() {
  state.subscriptions.forEach(s => { try { s.unsubscribe(); } catch {} });
  state.subscriptions = []; state.chats.clear(); state.messages.clear(); state.profiles.clear();
  state.activeChatId = null; state.user = null; state.profile = null;
  $("chatList").innerHTML = ""; $("messages").innerHTML = "";
}

// ============================================================
// PRESENCE
// ============================================================
function setupPresence() {
  const setOn = () => supabase.from("profiles").update({ is_online: true, last_seen: new Date().toISOString() }).eq("id", state.user.id);
  const setOff = () => supabase.from("profiles").update({ is_online: false, last_seen: new Date().toISOString() }).eq("id", state.user.id);
  setOn();
  window.addEventListener("beforeunload", setOff);
  setInterval(setOn, 25000);
  const ch = supabase.channel("profiles-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (p) => {
      const d = p.new;
      if (state.profiles.has(d.id)) state.profiles.set(d.id, d);
      if (d.id === state.user.id) state.profile = d;
      renderPeople(); renderChatList(); updateChatHeader();
    }).subscribe();
  state.subscriptions.push(ch);
}

// ============================================================
// PROFILES
// ============================================================
async function loadProfiles() {
  const { data } = await supabase.from("profiles").select("*").neq("id", state.user.id);
  (data || []).forEach(p => state.profiles.set(p.id, p));
}

function renderPeople() {
  const grid = $("peopleGrid"); grid.innerHTML = "";
  const q = ($("peopleSearch").value || "").toLowerCase().trim();
  const list = [...state.profiles.values()].filter(p => !q || p.full_name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)).sort((a, b) => (b.is_online?1:0)-(a.is_online?1:0) || a.full_name.localeCompare(b.full_name));
  if (!list.length) { grid.innerHTML = `<p style="color:var(--text3);grid-column:1/-1;text-align:center;padding:40px;">No people found.</p>`; return; }
  list.forEach(p => {
    const card = el("div", "person-card");
    const blocked = state.blockedIds.has(p.id);
    card.innerHTML = `
      <div class="person-avatar" style="${avatarBg(p)}">${avatarContent(p)}<span class="dot ${p.is_online?"online":"offline"}"></span></div>
      <div class="person-name">${esc(p.full_name)}</div>
      <div class="person-username">@${esc(p.username)}</div>
      <div class="person-status">${p.is_online ? "Online" : "Last seen " + fmtLastSeen(p.last_seen)}</div>
      <button class="person-msg-btn">Message</button>
      <button class="person-block-btn" style="padding:4px 12px;border-radius:8px;font-size:.75rem;font-weight:600;border:1px solid var(--border);color:${blocked?"#ef4444":"var(--text2)"};background:${blocked?"rgba(239,68,68,.1)":"transparent"}">${blocked ? "Unblock" : "Block"}</button>
    `;
    card.querySelector(".person-msg-btn").addEventListener("click", (e) => { e.stopPropagation(); openChatWith(p.id); });
    card.querySelector(".person-block-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleBlock(p.id); });
    card.addEventListener("click", () => openChatWith(p.id));
    grid.appendChild(card);
  });
}

$("peopleSearch").addEventListener("input", renderPeople);

async function toggleBlock(userId) {
  if (state.blockedIds.has(userId)) {
    await supabase.from("blocked_users").delete().eq("blocker_id", state.user.id).eq("blocked_id", userId);
    state.blockedIds.delete(userId); toast("Unblocked");
  } else {
    await supabase.from("blocked_users").insert({ blocker_id: state.user.id, blocked_id: userId });
    state.blockedIds.add(userId); toast("Blocked");
  }
  renderPeople();
}

async function loadBlocked() {
  const { data } = await supabase.from("blocked_users").select("blocked_id").eq("blocker_id", state.user.id);
  state.blockedIds = new Set((data || []).map(b => b.blocked_id));
}

// ============================================================
// CHATS
// ============================================================
async function loadChats() {
  const { data: mem } = await supabase.from("chat_members").select("chat_id, role, muted, archived, last_read_at").eq("user_id", state.user.id);
  if (!mem || !mem.length) { renderChatList(); return; }
  const ids = mem.map(m => m.chat_id);
  const { data: chats } = await supabase.from("chats").select("*").in("id", ids);
  const { data: allMem } = await supabase.from("chat_members").select("chat_id, user_id, role").in("chat_id", ids);
  const { data: lastMsgs } = await supabase.from("messages").select("*").in("chat_id", ids).order("created_at", { ascending: false }).limit(50);

  const memberMap = new Map();
  (allMem || []).forEach(m => { if (!memberMap.has(m.chat_id)) memberMap.set(m.chat_id, []); memberMap.get(m.chat_id).push(m.user_id); });
  const lastMap = new Map();
  (lastMsgs || []).forEach(m => { if (!lastMap.has(m.chat_id)) lastMap.set(m.chat_id, m); });
  const memInfo = new Map(); mem.forEach(m => memInfo.set(m.chat_id, m));

  (chats || []).forEach(c => {
    c.members = memberMap.get(c.id) || [];
    c.myMember = memInfo.get(c.id);
    c.lastMessage = lastMap.get(c.id) || null;
    if (c.myMember?.muted) state.mutedChats.add(c.id);
    if (c.myMember?.archived) state.archivedChats.add(c.id);
    state.chats.set(c.id, c);
  });
  renderChatList();
}

function renderChatList() {
  const list = $("chatList"); list.innerHTML = "";
  const q = ($("sidebarSearch").value || "").toLowerCase().trim();

  // NUVO pinned
  const nuvo = el("div", "chat-item pinned");
  nuvo.innerHTML = `<div class="chat-item-avatar" style="background:linear-gradient(135deg,var(--wa-green),var(--wa-teal))"><i class='bx bx-bot'></i></div><div class="chat-item-body"><div class="chat-item-row"><span class="chat-item-name">NUVO</span></div><div class="chat-item-preview">Your AI assistant — ask me anything</div></div>`;
  nuvo.addEventListener("click", () => openNuvoChat());
  if (state.activeChatId === NUVO_ID) nuvo.classList.add("active");
  list.appendChild(nuvo);

  const chats = [...state.chats.values()].filter(c => !c.myMember?.archived).filter(c => !q || chatName(c).toLowerCase().includes(q)).sort((a, b) => new Date(b.lastMessage?.created_at || b.created_at) - new Date(a.lastMessage?.created_at || a.created_at));
  for (const c of chats) {
    const other = c.type === "group" ? null : otherMember(c);
    const name = chatName(c);
    const av = c.type === "group" ? `<div class="chat-item-avatar" style="background:var(--wa-teal)"><i class='bx bx-group'></i></div>` : `<div class="chat-item-avatar" style="${avatarBg(other)}">${avatarContent(other)}</div>`;
    const last = c.lastMessage;
    const prev = last ? (last.is_deleted ? "🚫 Deleted" : (last.sender_id === state.user.id ? "You: " : "") + (last.message_type === "text" ? "[Encrypted]" : mediaPreview(last.message_type))) : "No messages yet";
    const time = last ? fmtTime(last.created_at) : "";
    const muted = c.myMember?.muted ? `<i class='bx bx-bell-off' style="font-size:.7rem;color:var(--text3);margin-left:4px"></i>` : "";
    const item = el("div", "chat-item");
    item.innerHTML = `${av}<div class="chat-item-body"><div class="chat-item-row"><span class="chat-item-name">${esc(name)}</span><span class="chat-item-time">${time}</span></div><div class="chat-item-preview">${prev}${muted}</div></div>`;
    item.addEventListener("click", () => openChat(c.id));
    if (state.activeChatId === c.id) item.classList.add("active");
    list.appendChild(item);
  }
}

function mediaPreview(t) { return { image:"📷 Photo", video:"🎥 Video", audio:"🎵 Audio", voice:"🎤 Voice", document:"📄 Document" }[t] || "[Media]"; }
function otherMember(c) { const oid = (c.members || []).find(id => id !== state.user.id); return state.profiles.get(oid) || { id: oid, full_name: "User", username: "user" }; }
function chatName(c) { if (c.type === "group") return c.name || "Group"; const o = otherMember(c); return o?.full_name || "Chat"; }

$("sidebarSearch").addEventListener("input", renderChatList);

async function openChatWith(userId) {
  const { data: myMem } = await supabase.from("chat_members").select("chat_id").eq("user_id", state.user.id);
  if (myMem) for (const m of myMem) { const { data: mem } = await supabase.from("chat_members").select("user_id").eq("chat_id", m.chat_id); const ids = (mem || []).map(x => x.user_id); if (ids.length === 2 && ids.includes(userId)) { const c = state.chats.get(m.chat_id) || { id: m.chat_id }; c.members = ids; state.chats.set(m.chat_id, c); openChat(m.chat_id); switchView("chats"); return m.chat_id; } }
  const { data: chat } = await supabase.from("chats").insert({ type: "direct", created_by: state.user.id }).select().single();
  if (!chat) { toast("Could not start chat."); return null; }
  await supabase.from("chat_members").insert([{ chat_id: chat.id, user_id: state.user.id, role: "admin" }, { chat_id: chat.id, user_id: userId, role: "admin" }]);
  chat.members = [state.user.id, userId]; state.chats.set(chat.id, chat);
  openChat(chat.id); switchView("chats"); return chat.id;
}

async function openChat(chatId) {
  state.activeChatId = chatId;
  const c = state.chats.get(chatId);
  if (!c.members) { const { data: mem } = await supabase.from("chat_members").select("user_id").eq("chat_id", chatId); c.members = (mem || []).map(m => m.user_id); }
  await loadMessages(chatId);
  await markRead(chatId);
  renderChatList(); switchView("chats"); showChatPanel(); renderMessages(); updateChatHeader();
  subscribeToMessages(chatId); subscribeToTyping(chatId);
}

async function loadMessages(chatId) {
  const { data } = await supabase.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(200);
  const ids = (data || []).map(m => m.id);
  let reacts = [];
  if (ids.length) { const { data: r } = await supabase.from("reactions").select("*").in("message_id", ids); reacts = r || []; }
  const rmap = new Map();
  reacts.forEach(r => { if (!rmap.has(r.message_id)) rmap.set(r.message_id, []); rmap.get(r.message_id).push(r); });
  state.messages.set(chatId, (data || []).map(m => ({ ...m, reactions: rmap.get(m.id) || [] })));
}

// ============================================================
// NUVO CHAT
// ============================================================
function openNuvoChat() {
  state.activeChatId = NUVO_ID;
  switchView("chats"); showChatPanel(); renderNuvoMessages(); updateNuvoHeader(); renderChatList();
}

function renderNuvoMessages() {
  const box = $("messages"); box.innerHTML = "";
  if (!state.nuvoMessages.length) state.nuvoMessages.push({ role: "nuvo", content: "Hi! I'm NUVO, your AI assistant. Ask me anything — questions, writing help, translations, jokes, or just chat!", created_at: new Date().toISOString() });
  state.nuvoMessages.forEach(m => {
    const row = el("div", "msg-row " + (m.role === "me" ? "me" : "them"));
    const av = m.role === "nuvo" ? `<div class="msg-avatar" style="background:linear-gradient(135deg,var(--wa-green),var(--wa-teal))"><i class='bx bx-bot'></i></div>` : `<div class="msg-avatar" style="${avatarBg(state.profile)}">${avatarContent(state.profile)}</div>`;
    row.innerHTML = `${av}<div class="msg-bubble">${formatContent(m.content)}<div class="msg-meta">${fmtTime(m.created_at)}</div></div>`;
    box.appendChild(row);
  });
  box.scrollTop = box.scrollHeight;
}

async function sendNuvoMessage(text) {
  state.nuvoMessages.push({ role: "me", content: text, created_at: new Date().toISOString() });
  renderNuvoMessages();
  showNuvoTyping(true);
  const reply = await window.NUVO.respond(text);
  showNuvoTyping(false);
  state.nuvoMessages.push({ role: "nuvo", content: reply, created_at: new Date().toISOString() });
  renderNuvoMessages(); playSound(); updateTabBadge();
}

function showNuvoTyping(show) {
  const box = $("messages"); const ex = box.querySelector(".nuvo-typing"); if (ex) ex.remove();
  if (!show) return;
  const row = el("div", "msg-row them nuvo-typing");
  row.innerHTML = `<div class="msg-avatar" style="background:linear-gradient(135deg,var(--wa-green),var(--wa-teal))"><i class='bx bx-bot'></i></div><div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  box.appendChild(row); box.scrollTop = box.scrollHeight;
}

function updateNuvoHeader() {
  $("chatHeaderName").textContent = "NUVO";
  $("chatHeaderStatus").textContent = "AI Assistant";
  $("chatHeaderStatus").className = "chat-header-status";
  $("chatHeaderAvatar").innerHTML = `<div style="background:linear-gradient(135deg,var(--wa-green),var(--wa-teal));width:100%;height:100%;display:flex;align-items:center;justify-content:center"><i class='bx bx-bot' style="font-size:1.2rem;color:#fff"></i></div>`;
}

// ============================================================
// REALTIME
// ============================================================
function setupRealtime() {
  const ch = supabase.channel("global-changes")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_members" }, async (p) => {
      if (p.new.user_id === state.user.id) { await loadChats(); }
    }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_members" }, () => { loadChats(); })
    .subscribe();
  state.subscriptions.push(ch);
}

function subscribeToMessages(chatId) {
  state.subscriptions = state.subscriptions.filter(s => { if (s._topic && s._topic.startsWith("msg-")) { try { s.unsubscribe(); } catch {} return false; } return true; });
  const ch = supabase.channel("msg-" + chatId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, async (p) => {
      const m = { ...p.new, reactions: [] };
      const list = state.messages.get(chatId) || [];
      if (!list.find(x => x.id === m.id)) {
        list.push(m); state.messages.set(chatId, list);
        if (state.activeChatId === chatId) { renderMessages(); if (m.sender_id !== state.user.id) { markRead(chatId); playSound(); } }
        const c = state.chats.get(chatId); if (c) { c.lastMessage = m; renderChatList(); }
        if (m.sender_id !== state.user.id) updateTabBadge();
      }
    }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (p) => {
      const list = state.messages.get(chatId) || [], i = list.findIndex(x => x.id === p.new.id);
      if (i >= 0) { list[i] = { ...list[i], ...p.new }; state.messages.set(chatId, list); if (state.activeChatId === chatId) renderMessages(); }
    }).on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (p) => {
      const list = (state.messages.get(chatId) || []).filter(x => x.id !== p.old.id); state.messages.set(chatId, list); if (state.activeChatId === chatId) renderMessages();
    }).on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, async () => {
      if (state.activeChatId === chatId) { await loadMessages(chatId); renderMessages(); }
    }).subscribe();
  ch._topic = "msg-" + chatId; state.subscriptions.push(ch);
}

function subscribeToTyping(chatId) {
  const ch = supabase.channel("typing-" + chatId);
  ch.on("broadcast", { event: "typing" }, (p) => { if (p && p.userId !== state.user.id) showTypingIndicator(chatId, p.name || "Someone"); })
    .on("broadcast", { event: "stop" }, (p) => { if (p && p.userId !== state.user.id) hideTypingIndicator(chatId); })
    .subscribe();
  ch._topic = "typing-" + chatId; state.subscriptions.push(ch);
}

function broadcastTyping(chatId) {
  const ch = state.subscriptions.find(s => s._topic === "typing-" + chatId); if (!ch) return;
  ch.send({ type: "broadcast", event: "typing", payload: { userId: state.user.id, name: state.profile.full_name } });
  clearTimeout(state.typingTimers.get(chatId));
  state.typingTimers.set(chatId, setTimeout(() => ch.send({ type: "broadcast", event: "stop", payload: { userId: state.user.id } }), 3000));
}

function showTypingIndicator(chatId, name) {
  if (!state.settings.typing || state.activeChatId !== chatId) return;
  const box = $("messages"); let t = box.querySelector(".typing-row"); if (t) return;
  t = el("div", "typing-row");
  t.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div><span class="typing-text">${esc(name)} is typing...</span>`;
  box.appendChild(t); box.scrollTop = box.scrollHeight;
  clearTimeout(state.typingTimers.get(chatId + "-hide"));
  state.typingTimers.set(chatId + "-hide", setTimeout(() => hideTypingIndicator(chatId), 3000));
}
function hideTypingIndicator(chatId) { const t = $("messages").querySelector(".typing-row"); if (t) t.remove(); }

// ============================================================
// RENDER MESSAGES
// ============================================================
function renderMessages() {
  const box = $("messages"); box.innerHTML = "";
  const chatId = state.activeChatId;
  if (chatId === NUVO_ID) { renderNuvoMessages(); return; }
  const list = state.messages.get(chatId) || [];
  let lastDate = "";
  list.forEach(m => {
    const d = fmtDateSep(m.created_at);
    if (d !== lastDate) { box.appendChild(el("div", "date-sep", `<span>${d}</span>`)); lastDate = d; }
    const mine = m.sender_id === state.user.id;
    const row = el("div", "msg-row " + (mine ? "me" : "them")); row.dataset.id = m.id;
    const sender = state.profiles.get(m.sender_id) || (state.profile && state.profile.id === m.sender_id ? state.profile : { full_name: "User" });
    const av = mine ? `<div class="msg-avatar" style="${avatarBg(state.profile)}">${avatarContent(state.profile)}</div>` : `<div class="msg-avatar" style="${avatarBg(sender)}">${avatarContent(sender)}</div>`;
    let replyHtml = "";
    if (m.reply_to_id) { const orig = list.find(x => x.id === m.reply_to_id); if (orig) { const sn = orig.sender_id === state.user.id ? "You" : (state.profiles.get(orig.sender_id) || {}).full_name || "User"; replyHtml = `<div class="msg-reply-quote"><div class="quote-name">${esc(sn)}</div>${esc(orig.content || "[Media]").slice(0, 80)}</div>`; } }
    const content = m.is_deleted ? `<span class="msg-deleted">🚫 This message was deleted</span>` : formatContent(m.content || "");
    const edited = m.is_edited ? `<span style="font-size:.65rem;opacity:.5"> edited</span>` : "";
    const fwd = m.forwarded_from ? `<div style="font-size:.72rem;color:var(--text2);font-style:italic;margin-bottom:4px"><i class='bx bx-share-alt'></i> Forwarded</div>` : "";
    const reactHtml = (m.reactions && m.reactions.length) ? `<div class="msg-reactions">${Object.entries(m.reactions.reduce((a, r) => { a[r.emoji] = (a[r.emoji] || 0) + 1; return a; }, {})).map(([e, c]) => `<span class="msg-reaction">${e}${c > 1 ? " " + c : ""}</span>`).join("")}</div>` : "";
    const star = state.starredIds.has(m.id) ? `<span style="position:absolute;top:-6px;${mine ? "left:-6px" : "right:-6px"};color:#fbbf24;font-size:.8rem"><i class='bx bxs-star'></i></span>` : "";
    row.innerHTML = `${av}<div style="position:relative">${star}<div class="msg-bubble">${fwd}${replyHtml}${content}<div class="msg-meta">${fmtTime(m.created_at)}${edited}</div></div>${reactHtml}</div>`;
    const bub = row.querySelector(".msg-bubble");
    bub.addEventListener("contextmenu", (e) => { e.preventDefault(); openCtxMenu(e, m); });
    let lt; bub.addEventListener("touchstart", (e) => { lt = setTimeout(() => openCtxMenu({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, preventDefault: () => {} }, m), 500); });
    bub.addEventListener("touchend", () => clearTimeout(lt));
    bub.addEventListener("touchmove", () => clearTimeout(lt));
    box.appendChild(row);
  });
  box.scrollTop = box.scrollHeight;
}

function formatContent(text) {
  if (!text) return "";
  let h = esc(text);
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre style="background:rgba(0,0,0,.2);padding:8px;border-radius:8px;overflow-x:auto;margin:4px 0;font-size:.82rem">${c}</pre>`);
  h = h.replace(/`([^`]+)`/g, (_, c) => `<code style="background:rgba(0,0,0,.2);padding:1px 5px;border-radius:4px;font-size:.85em">${c}</code>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  h = h.replace(/\n/g, "<br>");
  return h;
}

// ============================================================
// READ RECEIPTS
// ============================================================
async function markRead(chatId) {
  if (chatId === NUVO_ID) return;
  const now = new Date().toISOString();
  await supabase.from("chat_members").update({ last_read_at: now }).eq("chat_id", chatId).eq("user_id", state.user.id);
  const msgs = state.messages.get(chatId) || [];
  for (const m of msgs) {
    if (m.sender_id !== state.user.id && !m.is_deleted) {
      await supabase.from("message_status").upsert({ message_id: m.id, user_id: state.user.id, status: "read", updated_at: now });
    }
  }
}

// ============================================================
// SENDING
// ============================================================
const msgInput = $("messageInput"), sendBtn = $("sendBtn");
sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
msgInput.addEventListener("input", () => { autoGrow(msgInput); if (state.activeChatId && state.activeChatId !== NUVO_ID) broadcastTyping(state.activeChatId); });
function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }

async function sendMessage() {
  const text = msgInput.value.trim(); if (!text) return;
  msgInput.value = ""; autoGrow(msgInput);
  const chatId = state.activeChatId;
  if (chatId === NUVO_ID) { await sendNuvoMessage(text); return; }
  if (state.editTarget) { const id = state.editTarget.id; state.editTarget = null; await editMessage(id, text); return; }
  const replyTo = state.replyTo; state.replyTo = null; hideReplyPreview();
  const { data } = await supabase.from("messages").insert({ chat_id: chatId, sender_id: state.user.id, content: text, reply_to_id: replyTo || null }).select().single();
  if (data) {
    const list = state.messages.get(chatId) || []; list.push({ ...data, reactions: [] }); state.messages.set(chatId, list);
    renderMessages();
    const c = state.chats.get(chatId); if (c) { c.lastMessage = data; renderChatList(); }
  }
}

// ============================================================
// EMOJI PANEL
// ============================================================
const emojiPanel = $("emojiPanel");
EMOJIS.forEach(e => { const b = el("button", "emoji-btn", e); b.addEventListener("click", () => { msgInput.value += e; msgInput.focus(); autoGrow(msgInput); }); emojiPanel.appendChild(b); });
$("emojiBtn").addEventListener("click", () => emojiPanel.classList.toggle("hidden"));
document.addEventListener("click", (e) => { if (!emojiPanel.classList.contains("hidden") && !emojiPanel.contains(e.target) && e.target.id !== "emojiBtn" && !e.target.closest("#emojiBtn")) emojiPanel.classList.add("hidden"); });

// ============================================================
// VOICE MESSAGES
// ============================================================
let mediaRecorder = null, voiceChunks = [], voiceTimer = null, voiceSeconds = 0;
const voiceBtn = $("voiceBtn");

voiceBtn.addEventListener("mousedown", startRecording);
voiceBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startRecording(); });
voiceBtn.addEventListener("mouseup", stopRecording);
voiceBtn.addEventListener("mouseleave", () => { if (mediaRecorder) stopRecording(); });
voiceBtn.addEventListener("touchend", (e) => { e.preventDefault(); stopRecording(); });

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceChunks = []; voiceSeconds = 0;
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) voiceChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(voiceTimer);
      voiceBtn.querySelector("i").className = "bx bx-microphone";
      voiceBtn.style.color = "";
      if (voiceChunks.length === 0 || voiceSeconds === 0) return;
      const blob = new Blob(voiceChunks, { type: "audio/webm" });
      const path = `${state.user.id}/voice_${Date.now()}.webm`;
      const { error } = await supabase.storage.from("media").upload(path, blob);
      if (error) { toast("Voice upload failed"); return; }
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      const chatId = state.activeChatId;
      const { data: msg } = await supabase.from("messages").insert({ chat_id: chatId, sender_id: state.user.id, content: `Voice message (${voiceSeconds}s)`, message_type: "voice", media_url: urlData.publicUrl }).select().single();
      if (msg) { const list = state.messages.get(chatId) || []; list.push({ ...msg, reactions: [] }); state.messages.set(chatId, list); renderMessages(); }
    };
    mediaRecorder.start();
    voiceTimer = setInterval(() => { voiceSeconds++; voiceBtn.querySelector("i").className = "bx bx-stop"; voiceBtn.style.color = "#ef4444"; }, 1000);
  } catch (e) { toast("Microphone access denied"); }
}

function stopRecording() { if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop(); }

// ============================================================
// MEDIA UPLOAD
// ============================================================
$("attachBtn").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const ext = file.name.split(".").pop(), path = `${state.user.id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file);
  if (error) { toast("Upload failed"); return; }
  const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
  const mt = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
  const chatId = state.activeChatId;
  const { data: msg } = await supabase.from("messages").insert({ chat_id: chatId, sender_id: state.user.id, content: file.name, message_type: mt, media_url: urlData.publicUrl }).select().single();
  if (msg) { const list = state.messages.get(chatId) || []; list.push({ ...msg, reactions: [] }); state.messages.set(chatId, list); renderMessages(); }
  e.target.value = "";
});

// ============================================================
// CONTEXT MENU
// ============================================================
const ctxMenu = $("ctxMenu");
function openCtxMenu(e, msg) {
  ctxMenu.innerHTML = "";
  const rr = el("div", "ctx-reactions");
  REACTION_EMOJIS.forEach(em => { const b = el("button", "react-btn", em); b.addEventListener("click", () => { toggleReaction(msg.id, em); closeCtx(); }); rr.appendChild(b); });
  ctxMenu.appendChild(rr);
  const items = [
    { ic: "bx-reply", label: "Reply", fn: () => setReplyTo(msg) },
    { ic: "bx-copy", label: "Copy", fn: () => { navigator.clipboard.writeText(msg.content || ""); toast("Copied"); } },
    { ic: "bx-share-alt", label: "Forward", fn: () => { forwardMessage(msg); } },
    { ic: "bx-star", label: state.starredIds.has(msg.id) ? "Unstar" : "Star", fn: () => toggleStar(msg.id) },
  ];
  if (msg.sender_id === state.user.id && !msg.is_deleted) {
    items.push({ ic: "bx-edit", label: "Edit", fn: () => startEdit(msg) });
    items.push({ ic: "bx-trash", label: "Delete for everyone", danger: true, fn: () => deleteMessage(msg.id, true) });
  }
  items.push({ ic: "bx-trash", label: "Delete for me", danger: true, fn: () => deleteMessage(msg.id, false) });
  items.forEach(it => { const b = el("button", "ctx-item" + (it.danger ? " danger" : ""), `<i class='${it.ic}'></i> ${it.label}`); b.addEventListener("click", () => { it.fn(); closeCtx(); }); ctxMenu.appendChild(b); });
  ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 200) + "px";
  ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 280) + "px";
  ctxMenu.classList.remove("hidden");
}
function closeCtx() { ctxMenu.classList.add("hidden"); }
document.addEventListener("click", (e) => { if (!ctxMenu.contains(e.target)) closeCtx(); });

async function toggleReaction(messageId, emoji) {
  const { data: ex } = await supabase.from("reactions").select("emoji").eq("message_id", messageId).eq("user_id", state.user.id).maybeSingle();
  if (ex) { if (ex.emoji === emoji) await supabase.from("reactions").delete().eq("message_id", messageId).eq("user_id", state.user.id); else await supabase.from("reactions").update({ emoji }).eq("message_id", messageId).eq("user_id", state.user.id); }
  else await supabase.from("reactions").insert({ message_id: messageId, user_id: state.user.id, emoji });
  await loadMessages(state.activeChatId); renderMessages();
}

async function deleteMessage(messageId, forAll) {
  if (forAll) await supabase.from("messages").update({ is_deleted: true, content: "" }).eq("id", messageId).eq("sender_id", state.user.id);
  else { const list = (state.messages.get(state.activeChatId) || []).filter(m => m.id !== messageId); state.messages.set(state.activeChatId, list); }
  await loadMessages(state.activeChatId); renderMessages(); toast(forAll ? "Deleted for everyone" : "Deleted for you");
}

function startEdit(msg) { state.editTarget = msg; msgInput.value = msg.content || ""; msgInput.focus(); autoGrow(msgInput); }
async function editMessage(messageId, newText) {
  await supabase.from("messages").update({ content: newText, is_edited: true }).eq("id", messageId).eq("sender_id", state.user.id);
  const list = state.messages.get(state.activeChatId) || [];
  const i = list.findIndex(m => m.id === messageId);
  if (i >= 0) { list[i] = { ...list[i], content: newText, is_edited: true }; state.messages.set(state.activeChatId, list); }
  renderMessages();
}

async function toggleStar(messageId) {
  if (state.starredIds.has(messageId)) { await supabase.from("starred_messages").delete().eq("user_id", state.user.id).eq("message_id", messageId); state.starredIds.delete(messageId); toast("Unstarred"); }
  else { await supabase.from("starred_messages").insert({ user_id: state.user.id, message_id: messageId }); state.starredIds.add(messageId); toast("Starred"); }
  renderMessages();
}

async function loadStarred() { const { data } = await supabase.from("starred_messages").select("message_id").eq("user_id", state.user.id); state.starredIds = new Set((data || []).map(s => s.message_id)); }

function forwardMessage(msg) {
  const card = $("modalCard");
  const people = [...state.profiles.values()];
  card.innerHTML = `<h3>Forward to...</h3><div class="modal-list" id="fwdList"></div><div class="modal-actions"><button class="modal-cancel">Cancel</button></div>`;
  const listEl = card.querySelector("#fwdList");
  people.forEach(p => {
    const row = el("div", "modal-person");
    row.innerHTML = `<div class="person-avatar" style="width:36px;height:36px;font-size:1rem;${avatarBg(p)}">${avatarContent(p)}</div><div><div style="font-weight:600;font-size:.9rem">${esc(p.full_name)}</div><div style="font-size:.78rem;color:var(--text3)">@${esc(p.username)}</div></div>`;
    row.addEventListener("click", async () => {
      const cid = await findOrCreateDirectChat(p.id);
      if (cid) await supabase.from("messages").insert({ chat_id: cid, sender_id: state.user.id, content: msg.content, message_type: msg.message_type, media_url: msg.media_url, forwarded_from: msg.sender_id });
      toast("Forwarded"); closeModal();
    });
    listEl.appendChild(row);
  });
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  $("modal").classList.remove("hidden");
}

async function findOrCreateDirectChat(userId) {
  const { data: myMem } = await supabase.from("chat_members").select("chat_id").eq("user_id", state.user.id);
  if (myMem) for (const m of myMem) { const { data: mem } = await supabase.from("chat_members").select("user_id").eq("chat_id", m.chat_id); const ids = (mem || []).map(x => x.user_id); if (ids.length === 2 && ids.includes(userId)) return m.chat_id; }
  const { data: chat } = await supabase.from("chats").insert({ type: "direct", created_by: state.user.id }).select().single();
  if (!chat) return null;
  await supabase.from("chat_members").insert([{ chat_id: chat.id, user_id: state.user.id, role: "admin" }, { chat_id: chat.id, user_id: userId, role: "admin" }]);
  chat.members = [state.user.id, userId]; state.chats.set(chat.id, chat);
  return chat.id;
}

// ============================================================
// REPLY PREVIEW
// ============================================================
function setReplyTo(msg) { state.replyTo = msg.id; const sn = msg.sender_id === state.user.id ? "You" : (state.profiles.get(msg.sender_id) || {}).full_name || "User"; $("replyPreview").querySelector(".reply-preview-content").innerHTML = `<b>${esc(sn)}</b><br>${esc(msg.content || "[Media]").slice(0, 80)}`; $("replyPreview").classList.remove("hidden"); msgInput.focus(); }
$("replyPreviewClose").addEventListener("click", () => { state.replyTo = null; hideReplyPreview(); });
function hideReplyPreview() { $("replyPreview").classList.add("hidden"); }

// ============================================================
// CHAT HEADER / SEARCH
// ============================================================
function updateChatHeader() {
  const chatId = state.activeChatId;
  if (chatId === NUVO_ID) { updateNuvoHeader(); return; }
  const c = state.chats.get(chatId); if (!c) return;
  $("chatHeaderName").textContent = chatName(c);
  if (c.type === "group") { $("chatHeaderStatus").textContent = `${(c.members || []).length} members`; $("chatHeaderStatus").className = "chat-header-status"; $("chatHeaderAvatar").innerHTML = `<div style="background:var(--wa-teal);width:100%;height:100%;display:flex;align-items:center;justify-content:center"><i class='bx bx-group' style="font-size:1.2rem;color:#fff"></i></div>`; }
  else { const o = otherMember(c); $("chatHeaderStatus").textContent = o?.is_online ? "Online" : "Last seen " + fmtLastSeen(o?.last_seen); $("chatHeaderStatus").className = "chat-header-status " + (o?.is_online ? "online" : ""); $("chatHeaderAvatar").style.cssText = avatarBg(o); $("chatHeaderAvatar").innerHTML = avatarContent(o); }
}

$("chatSearchBtn").addEventListener("click", () => $("chatSearchBar").classList.toggle("hidden"));
$("chatSearchClose").addEventListener("click", () => { $("chatSearchBar").classList.add("hidden"); $("chatSearchInput").value = ""; renderMessages(); });
$("chatSearchInput").addEventListener("input", () => {
  const q = $("chatSearchInput").value.toLowerCase().trim();
  document.querySelectorAll(".msg-row").forEach(r => { const t = r.textContent.toLowerCase(); r.style.display = (!q || t.includes(q)) ? "" : "none"; });
});

$("chatBackBtn").addEventListener("click", () => hideChatPanel());
function showChatPanel() { document.querySelector(".app").classList.add("show-chat"); }
function hideChatPanel() { document.querySelector(".app").classList.remove("show-chat"); state.activeChatId = null; renderChatList(); switchView("chats"); }

// ============================================================
// CALLS (UI only)
// ============================================================
$("callVoiceBtn").addEventListener("click", () => openCallModal("voice"));
$("callVideoBtn").addEventListener("click", () => openCallModal("video"));
function openCallModal(type) {
  const chatId = state.activeChatId; if (chatId === NUVO_ID) { toast("Cannot call NUVO"); return; }
  const c = state.chats.get(chatId); if (!c || c.type === "group") { toast("Calls are for direct chats"); return; }
  const o = otherMember(c);
  $("callName").textContent = o?.full_name || "User";
  $("callAvatar").style.cssText = avatarBg(o);
  $("callAvatar").innerHTML = avatarContent(o);
  $("callStatus").textContent = `Calling... (${type})`;
  $("callModal").classList.remove("hidden");
  // Log call
  supabase.from("calls").insert({ caller_id: state.user.id, receiver_id: o.id, type, status: "ongoing" }).then(({ data }) => { state._currentCallId = data?.id; });
  // Simulate call
  setTimeout(() => { if (!$("callModal").classList.contains("hidden")) { $("callStatus").textContent = type === "video" ? "Video call connected" : "Call connected"; } }, 2000);
}
$("callEndBtn").addEventListener("click", async () => {
  $("callModal").classList.add("hidden");
  if (state._currentCallId) { await supabase.from("calls").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", state._currentCallId); state._currentCallId = null; }
});
$("callMuteBtn").addEventListener("click", () => { const i = $("callMuteBtn").querySelector("i"); i.classList.toggle("bx-microphone"); i.classList.toggle("bx-microphone-off"); $("callMuteBtn").classList.toggle("muted"); });
$("callVideoToggleBtn").addEventListener("click", () => { const i = $("callVideoToggleBtn").querySelector("i"); i.classList.toggle("bx-video"); i.classList.toggle("bx-video-off"); $("callVideoToggleBtn").classList.toggle("muted"); });
$("callSpeakerBtn").addEventListener("click", () => { $("callSpeakerBtn").classList.toggle("muted"); });

// ============================================================
// VIEWS
// ============================================================
document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => { if (b.dataset.view === "nuvo") { openNuvoChat(); return; } switchView(b.dataset.view); }));
$("peopleBackBtn").addEventListener("click", () => switchView("chats"));
$("statusBackBtn").addEventListener("click", () => switchView("chats"));
$("settingsBackBtn").addEventListener("click", () => switchView("profile"));

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $("emptyState").classList.toggle("hidden", view !== "chats" || state.activeChatId !== null);
  $("peopleView").classList.toggle("hidden", view !== "people");
  $("profileView").classList.toggle("hidden", view !== "profile");
  $("settingsView").classList.toggle("hidden", view !== "settings");
  $("statusView").classList.toggle("hidden", view !== "status");
  $("chatView").classList.toggle("hidden", view !== "chats" || state.activeChatId === null);
  if (view === "people") renderPeople();
  if (view === "profile") renderProfile();
  if (view === "status") renderStatus();
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
  const av = $("profileAvatar"); av.style.cssText = avatarBg(state.profile); av.innerHTML = avatarContent(state.profile);
  $("profileBio").value = state.profile.bio || "";
  $("profileStats").innerHTML = `<div class="stat"><div class="stat-num">${state.chats.size}</div><div class="stat-label">Chats</div></div><div class="stat"><div class="stat-num">${state.profiles.size}</div><div class="stat-label">People</div></div><div class="stat"><div class="stat-num">${state.starredIds.size}</div><div class="stat-label">Starred</div></div>`;
}

$("saveBioBtn").addEventListener("click", async () => { const bio = $("profileBio").value.trim(); await supabase.from("profiles").update({ bio }).eq("id", state.user.id); state.profile.bio = bio; toast("Status updated"); });
$("editAvatarBtn").addEventListener("click", () => $("profileAvatarFile").click());
$("profileAvatarFile").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { await supabase.from("profiles").update({ avatar_url: r.result }).eq("id", state.user.id); state.profile.avatar_url = r.result; renderProfile(); renderChatList(); toast("Photo updated"); }; r.readAsDataURL(f); });
$("logoutBtn").addEventListener("click", () => { openModal({ title: "Log out?", body: "<p style='color:var(--text2);margin-bottom:8px'>You'll need to log in again.</p>", confirmText: "Log out", onConfirm: async () => { if (state.profile) await supabase.from("profiles").update({ is_online: false, last_seen: new Date().toISOString() }).eq("id", state.user.id); await supabase.auth.signOut(); closeModal(); } }); });
$("settingsBtn").addEventListener("click", () => switchView("settings"));

// ============================================================
// SETTINGS
// ============================================================
$("themeToggle").addEventListener("click", () => toggleTheme());
document.querySelectorAll(".seg-btn").forEach(b => b.addEventListener("click", () => { applyTheme(b.dataset.theme); saveTheme(b.dataset.theme); document.querySelectorAll(".seg-btn").forEach(x => x.classList.toggle("active", x === b)); }));
$("notifToggle").addEventListener("change", (e) => { state.settings.sound = e.target.checked; saveSettings(); });
$("typingToggle").addEventListener("change", (e) => { state.settings.typing = e.target.checked; saveSettings(); });
$("receiptsToggle").addEventListener("change", (e) => { state.settings.receipts = e.target.checked; saveSettings(); });

function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); const b = $("themeToggle"); if (b) { b.querySelector("i").className = t === "dark" ? "bx bx-moon" : "bx bx-sun"; b.querySelector("span").textContent = t === "dark" ? "Dark mode" : "Light mode"; } }
function toggleTheme() { const c = document.documentElement.getAttribute("data-theme"), n = c === "dark" ? "light" : "dark"; applyTheme(n); saveTheme(n); document.querySelectorAll(".seg-btn").forEach(x => x.classList.toggle("active", x.dataset.theme === n)); }
function saveTheme(t) { localStorage.setItem("nuvora-theme", t); }
function loadTheme() { return localStorage.getItem("nuvora-theme") || "dark"; }
function saveSettings() { localStorage.setItem("nuvora-settings", JSON.stringify(state.settings)); }
function loadSettings() { try { return JSON.parse(localStorage.getItem("nuvora-settings")) || {}; } catch { return {}; } }

// ============================================================
// STATUS / STORIES
// ============================================================
async function renderStatus() {
  const content = $("statusContent"); content.innerHTML = "";
  const { data: statuses } = await supabase.from("statuses").select("*").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50);
  const my = (statuses || []).filter(s => s.user_id === state.user.id);
  const others = (statuses || []).filter(s => s.user_id !== state.user.id);

  content.innerHTML = `
    <button class="status-post-btn" id="postStatusBtn"><i class='bx bx-plus'></i> Post a Status</button>
    <div id="postStatusForm" class="hidden" style="margin-bottom:20px">
      <textarea id="statusText" placeholder="Type a status..." style="width:100%;padding:12px;border-radius:12px;background:var(--surface);border:1px solid var(--border);color:var(--text);resize:none;margin-bottom:8px" rows="3"></textarea>
      <div style="display:flex;gap:8px">
        <button id="postStatusSubmit" class="btn-small">Post</button>
        <button id="postStatusCancel" class="btn-ghost">Cancel</button>
      </div>
    </div>
    <div class="status-section"><h3>My Status</h3>${my.length ? my.map(s => statusItem(s, true)).join("") : "<p style='color:var(--text3);padding:8px'>No status posted</p>"}</div>
    ${others.length ? `<div class="status-section"><h3>Recent Updates</h3>${others.map(s => statusItem(s, false)).join("")}</div>` : ""}
  `;

  $("postStatusBtn").addEventListener("click", () => { $("postStatusForm").classList.toggle("hidden"); });
  $("postStatusCancel").addEventListener("click", () => { $("postStatusForm").classList.add("hidden"); });
  $("postStatusSubmit").addEventListener("click", async () => {
    const text = $("statusText").value.trim(); if (!text) return;
    await supabase.from("statuses").insert({ user_id: state.user.id, encrypted_content: btoa(unescape(encodeURIComponent(text))), iv: "status", status_type: "text" });
    toast("Status posted"); renderStatus();
  });
}

function statusItem(s, mine) {
  const p = mine ? state.profile : state.profiles.get(s.user_id);
  const text = s.encrypted_content ? decodeURIComponent(escape(atob(s.encrypted_content))) : "[Media]";
  return `<div class="status-item" data-id="${s.id}"><div class="status-ring"><div class="status-fallback" style="${avatarBg(p)}">${avatarContent(p)}</div></div><div><div style="font-weight:600;font-size:.9rem">${esc(p?.full_name || "Unknown")}</div><div style="font-size:.78rem;color:var(--text3)">${fmtTime(s.created_at)}</div></div></div>`;
}

// ============================================================
// NEW CHAT / GROUP MODAL
// ============================================================
$("newChatBtn").addEventListener("click", () => openNewChatModal());
function openNewChatModal() {
  const card = $("modalCard"); const people = [...state.profiles.values()]; const selected = new Set();
  card.innerHTML = `<h3>Start a new chat</h3><input class="modal-input" id="modalGroupName" placeholder="Group name (optional)" /><div class="modal-list" id="modalPeopleList"></div><div class="modal-actions"><button class="modal-cancel">Cancel</button><button class="modal-confirm">Create</button></div>`;
  const listEl = card.querySelector("#modalPeopleList");
  people.forEach(p => {
    const row = el("div", "modal-person");
    row.innerHTML = `<div class="person-avatar" style="width:36px;height:36px;font-size:1rem;${avatarBg(p)}">${avatarContent(p)}</div><div><div style="font-weight:600;font-size:.9rem">${esc(p.full_name)}</div><div style="font-size:.78rem;color:var(--text3)">@${esc(p.username)}</div></div><i class='bx bx-check check hidden'></i>`;
    row.addEventListener("click", () => { const c = row.querySelector(".check"); if (selected.has(p.id)) { selected.delete(p.id); row.classList.remove("selected"); c.classList.add("hidden"); } else { selected.add(p.id); row.classList.add("selected"); c.classList.remove("hidden"); } });
    listEl.appendChild(row);
  });
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  card.querySelector(".modal-confirm").addEventListener("click", async () => {
    const ids = [...selected]; if (!ids.length) { toast("Select at least one person."); return; }
    const gn = $("modalGroupName").value.trim();
    if (ids.length === 1 && !gn) { closeModal(); await openChatWith(ids[0]); return; }
    const isGroup = !!gn || ids.length > 1;
    const { data: chat } = await supabase.from("chats").insert({ type: isGroup ? "group" : "direct", name: gn || null, created_by: state.user.id }).select().single();
    await supabase.from("chat_members").insert([{ chat_id: chat.id, user_id: state.user.id, role: "admin" }, ...ids.map(id => ({ chat_id: chat.id, user_id: id, role: "member" }))]);
    chat.members = [state.user.id, ...ids]; state.chats.set(chat.id, chat); closeModal(); openChat(chat.id);
  });
  $("modal").classList.remove("hidden");
}

function openModal({ title, body, confirmText, onConfirm }) {
  const card = $("modalCard");
  card.innerHTML = `<h3>${title}</h3>${body || ""}<div class="modal-actions"><button class="modal-cancel">Cancel</button><button class="modal-confirm">${confirmText || "OK"}</button></div>`;
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  card.querySelector(".modal-confirm").addEventListener("click", () => { if (onConfirm) onConfirm(); });
  $("modal").classList.remove("hidden");
}
function closeModal() { $("modal").classList.add("hidden"); }
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });

// ============================================================
// TAB BADGE
// ============================================================
function updateTabBadge() { state.unreadTotal++; document.title = `(${state.unreadTotal}) ${PAGE_TITLE}`; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { state.unreadTotal = 0; document.title = PAGE_TITLE; } });

// ============================================================
// SETTINGS: Block list, Starred, Call history, Archive
// ============================================================
$("blockListBtn").addEventListener("click", async () => {
  const card = $("modalCard");
  const blocked = [...state.profiles.values()].filter(p => state.blockedIds.has(p.id));
  card.innerHTML = `<h3>Blocked Users</h3><div class="modal-list">${blocked.length ? blocked.map(p => `<div class="modal-person"><div class="person-avatar" style="width:36px;height:36px;font-size:1rem;${avatarBg(p)}">${avatarContent(p)}</div><div><div style="font-weight:600;font-size:.9rem">${esc(p.full_name)}</div></div><button class="btn-small" data-id="${p.id}" style="margin-left:auto">Unblock</button></div>`).join("") : "<p style='color:var(--text3);padding:16px'>No blocked users.</p>"}</div><div class="modal-actions"><button class="modal-cancel">Close</button></div>`;
  card.querySelectorAll("button[data-id]").forEach(b => b.addEventListener("click", async () => { await toggleBlock(b.dataset.id); closeModal(); openModal({ title: "Blocked Users", body: "", confirmText: "" }); $("modal").classList.remove("hidden"); card.innerHTML = "<h3>Blocked Users</h3><p>Updated.</p><div class='modal-actions'><button class='modal-cancel'>Close</button></div>"; card.querySelector(".modal-cancel").addEventListener("click", closeModal); }));
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  $("modal").classList.remove("hidden");
});

$("starredBtn").addEventListener("click", async () => {
  const card = $("modalCard");
  const ids = [...state.starredIds];
  let html = "";
  for (const id of ids) { for (const [, list] of state.messages) { const m = list.find(x => x.id === id); if (m) { html += `<div style="padding:10px;border-bottom:1px solid var(--border)"><div style="font-size:.9rem">${esc(m.content || "[Media]")}</div><div style="font-size:.72rem;color:var(--text3)">${fmtTime(m.created_at)}</div></div>`; break; } } }
  card.innerHTML = `<h3>Starred Messages</h3><div class="modal-list">${html || "<p style='color:var(--text3);padding:16px'>No starred messages.</p>"}</div><div class="modal-actions"><button class="modal-cancel">Close</button></div>`;
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  $("modal").classList.remove("hidden");
});

$("callHistoryBtn").addEventListener("click", async () => {
  const card = $("modalCard");
  const { data: calls } = await supabase.from("calls").select("*").or(`caller_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`).order("started_at", { ascending: false }).limit(20);
  const html = (calls || []).map(c => {
    const other = c.caller_id === state.user.id ? state.profiles.get(c.receiver_id) : state.profiles.get(c.caller_id);
    const dir = c.caller_id === state.user.id ? "outgoing" : "incoming";
    const icon = dir === "outgoing" ? "bx-arrow-to-right" : "bx-arrow-to-left";
    const color = c.status === "missed" ? "#ef4444" : "var(--text2)";
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid var(--border)"><i class='bx ${icon}' style="color:${color};font-size:1.1rem"></i><div style="flex:1"><div style="font-weight:600;font-size:.9rem">${esc(other?.full_name || "Unknown")}</div><div style="font-size:.72rem;color:var(--text3)">${c.type} • ${c.status} • ${fmtTime(c.started_at)}</div></div></div>`;
  }).join("");
  card.innerHTML = `<h3>Call History</h3><div class="modal-list">${html || "<p style='color:var(--text3);padding:16px'>No calls yet.</p>"}</div><div class="modal-actions"><button class="modal-cancel">Close</button></div>`;
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  $("modal").classList.remove("hidden");
});

$("archiveBtn").addEventListener("click", async () => {
  const card = $("modalCard");
  const archived = [...state.chats.values()].filter(c => c.myMember?.archived);
  card.innerHTML = `<h3>Archived Chats</h3><div class="modal-list">${archived.length ? archived.map(c => `<div style="padding:10px;border-bottom:1px solid var(--border);cursor:pointer" data-id="${c.id}">${esc(chatName(c))}</div>`).join("") : "<p style='color:var(--text3);padding:16px'>No archived chats.</p>"}</div><div class="modal-actions"><button class="modal-cancel">Close</button></div>`;
  card.querySelectorAll("div[data-id]").forEach(d => d.addEventListener("click", async () => { await supabase.from("chat_members").update({ archived: false }).eq("chat_id", d.dataset.id).eq("user_id", state.user.id); closeModal(); await loadChats(); toast("Unarchived"); }));
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  $("modal").classList.remove("hidden");
});

// ============================================================
// CHAT MENU (mute, archive, disappearing)
// ============================================================
$("menuBtn").addEventListener("click", () => {
  openModal({
    title: "Menu",
    body: `<div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn-ghost" id="menuNewGroup"><i class='bx bx-group'></i> New Group</button>
      <button class="btn-ghost" id="menuArchived"><i class='bx bx-archive'></i> Archived</button>
      <button class="btn-ghost" id="menuStarred"><i class='bx bx-star'></i> Starred Messages</button>
      <button class="btn-ghost" id="menuSettings"><i class='bx bx-cog'></i> Settings</button>
    </div>`,
    confirmText: "Close",
    onConfirm: () => closeModal(),
  });
  setTimeout(() => {
    const ng = $("menuNewGroup"); if (ng) ng.addEventListener("click", () => { closeModal(); openNewChatModal(); });
    const ar = $("menuArchived"); if (ar) ar.addEventListener("click", () => $("archiveBtn").click());
    const st = $("menuStarred"); if (st) st.addEventListener("click", () => $("starredBtn").click());
    const se = $("menuSettings"); if (se) se.addEventListener("click", () => { closeModal(); switchView("settings"); });
  }, 50);
});
$("chatMenuBtn").addEventListener("click", () => {
  const chatId = state.activeChatId; if (!chatId || chatId === NUVO_ID) return;
  const c = state.chats.get(chatId); if (!c) return;
  openModal({
    title: "Chat Options",
    body: `<div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn-ghost" id="muteBtn"><i class='bx ${c.myMember?.muted ? "bx-bell" : "bx-bell-off"}'></i> ${c.myMember?.muted ? "Unmute" : "Mute"}</button>
      <button class="btn-ghost" id="archiveBtn2"><i class='bx bx-archive-in'></i> Archive</button>
      ${c.type === "group" ? `<button class="btn-ghost" id="addMemberBtn"><i class='bx bx-user-plus'></i> Add Members</button>` : ""}
    </div>`,
    confirmText: "Close",
    onConfirm: () => closeModal(),
  });
  setTimeout(() => {
    const mb = $("muteBtn"); if (mb) mb.addEventListener("click", async () => { const nm = !c.myMember?.muted; await supabase.from("chat_members").update({ muted: nm }).eq("chat_id", chatId).eq("user_id", state.user.id); await loadChats(); toast(nm ? "Muted" : "Unmuted"); closeModal(); });
    const ab = $("archiveBtn2"); if (ab) ab.addEventListener("click", async () => { await supabase.from("chat_members").update({ archived: true }).eq("chat_id", chatId).eq("user_id", state.user.id); await loadChats(); toast("Archived"); closeModal(); });
    const amb = $("addMemberBtn"); if (amb) amb.addEventListener("click", () => { closeModal(); openAddMembersModal(chatId); });
  }, 50);
});

function openAddMembersModal(chatId) {
  const card = $("modalCard"); const people = [...state.profiles.values()].filter(p => !state.chats.get(chatId).members.includes(p.id)); const selected = new Set();
  card.innerHTML = `<h3>Add Members</h3><div class="modal-list" id="addMemList"></div><div class="modal-actions"><button class="modal-cancel">Cancel</button><button class="modal-confirm">Add</button></div>`;
  const listEl = card.querySelector("#addMemList");
  people.forEach(p => {
    const row = el("div", "modal-person");
    row.innerHTML = `<div class="person-avatar" style="width:36px;height:36px;font-size:1rem;${avatarBg(p)}">${avatarContent(p)}</div><div><div style="font-weight:600;font-size:.9rem">${esc(p.full_name)}</div></div><i class='bx bx-check check hidden'></i>`;
    row.addEventListener("click", () => { const c = row.querySelector(".check"); if (selected.has(p.id)) { selected.delete(p.id); row.classList.remove("selected"); c.classList.add("hidden"); } else { selected.add(p.id); row.classList.add("selected"); c.classList.remove("hidden"); } });
    listEl.appendChild(row);
  });
  card.querySelector(".modal-cancel").addEventListener("click", closeModal);
  card.querySelector(".modal-confirm").addEventListener("click", async () => {
    if (selected.size) { await supabase.from("chat_members").insert([...selected].map(id => ({ chat_id: chatId, user_id: id, role: "member" }))); await loadChats(); toast("Members added"); }
    closeModal();
  });
  $("modal").classList.remove("hidden");
}

// ============================================================
// BOOT
// ============================================================
(async function boot() {
  applyTheme(loadTheme());
  const { data: { session } } = await supabase.auth.getSession();
  if (session && session.user) await initApp(session.user);
  else setTimeout(() => showAuth(), 1400);
})();
