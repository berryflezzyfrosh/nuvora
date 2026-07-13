// NUVORA - Pure vanilla JS chat app
// Uses Supabase for auth, database, realtime, and storage

const SUPABASE_URL = 'https://kmrvpfkdwjknglbszbpm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttcnZwZmtkd2prbmdsYnN6YnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NTc4NTIsImV4cCI6MjA5OTQzMzg1Mn0.MFmrJ54Ac1i8T56Zacwfohd0JWpgJBlWXOcuTiFmtWY';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// ============ State ============
const State = {
  user: null, profile: null, chats: [], messages: {}, profiles: {},
  privateKey: null, authReady: false, activeChat: null,
  callState: null, starredIds: new Set(),
  settings: { theme: 'dark', notifications: true },
  authMode: 'login', editing: false, replyTo: null, editTarget: null,
  newChatSelected: new Set(), newChatStep: 'select', typingTimeout: null,
  emojiCategory: 0, emojiSearch: '', realtimeChannels: [],
};

// ============ Utils ============
const COLORS = ['#25D366','#128C7E','#075E54','#34B7F1','#FF6B6B','#9B59B6','#E67E22','#1ABC9C','#3498DB','#E74C3C'];
function avatarColor(id) { if (!id) return COLORS[0]; let h=0; for (let i=0;i<id.length;i++) h=id.charCodeAt(i)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; }
function initials(name) { if (!name) return '?'; return name.split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase(); }
function formatTime(iso) { if (!iso) return ''; return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
function formatDate(iso) { if (!iso) return ''; const d=new Date(iso),t=new Date(),y=new Date(t); y.setDate(y.getDate()-1); if (d.toDateString()===t.toDateString()) return 'Today'; if (d.toDateString()===y.toDateString()) return 'Yesterday'; return d.toLocaleDateString([],{day:'numeric',month:'short',year:'numeric'}); }
function formatDuration(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }
function getMessagePreview(msg) { if (!msg) return ''; if (msg.is_deleted) return 'This message was deleted'; if (msg.message_type==='image') return 'Photo'; if (msg.message_type==='video') return 'Video'; if (msg.message_type==='voice') return 'Voice message'; if (msg.message_type==='audio') return 'Audio'; if (msg.message_type==='document') return 'Document'; return msg.decrypted||msg.content||''; }
function escapeHtml(s) { if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
let audioCtx = null;
function playSound() { try { if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.value=880; o.type='sine'; g.gain.setValueAtTime(0.15,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.3); o.start(); o.stop(audioCtx.currentTime+0.3); } catch {} }
function sanitizeInput(s,max=5000) { return typeof s==='string'?s.slice(0,max):''; }
function sanitizeName(s) { return typeof s==='string'?s.slice(0,100).trim():''; }
function sanitizeUsername(s) { return typeof s==='string'?s.toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,30):''; }
function validatePassword(p) { if (!p||p.length<8) return 'Password must be at least 8 characters'; if (!/[A-Z]/.test(p)) return 'Must contain an uppercase letter'; if (!/[a-z]/.test(p)) return 'Must contain a lowercase letter'; if (!/\d/.test(p)) return 'Must contain a number'; if (!/[^A-Za-z0-9]/.test(p)) return 'Must contain a special character'; return null; }
const rateStamps = [];
function rateLimitCheck() { const now=Date.now(); while (rateStamps.length&&now-rateStamps[0]>60000) rateStamps.shift(); if (rateStamps.length>=30) return false; rateStamps.push(now); return true; }

// ============ Crypto ============
const enc = new TextEncoder(), dec = new TextDecoder();
function b64(buf) { const b=new Uint8Array(buf); let s=''; for (const x of b) s+=String.fromCharCode(x); return btoa(s); }
function fromB64(s) { const b=atob(s),a=new Uint8Array(b.length); for (let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a.buffer; }
async function generateKeyPair() { const p=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey','deriveBits']); return {publicKey:b64(await crypto.subtle.exportKey('raw',p.publicKey)),privateKey:b64(await crypto.subtle.exportKey('pkcs8',p.privateKey))}; }
async function impPub(k) { return crypto.subtle.importKey('raw',fromB64(k),{name:'ECDH',namedCurve:'P-256'},false,[]); }
async function impPriv(k) { return crypto.subtle.importKey('pkcs8',fromB64(k),{name:'ECDH',namedCurve:'P-256'},false,['deriveKey','deriveBits']); }
async function dKey(p,k) { return crypto.subtle.deriveKey({name:'ECDH',public:k},p,{name:'AES-GCM',length:256},false,['encrypt','decrypt']); }
async function encryptMessage(txt,priv,pub) { const k=await dKey(await impPriv(priv),await impPub(pub)); const iv=crypto.getRandomValues(new Uint8Array(12)); const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(txt)); return {ciphertext:b64(ct),iv:b64(iv.buffer)}; }
async function decryptMessage(ct,iv,priv,pub) { try { const k=await dKey(await impPriv(priv),await impPub(pub)); return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(fromB64(iv))},k,fromB64(ct))); } catch { return '[Unable to decrypt]'; } }
const SK='nuvora_priv';
function storePrivateKey(k,pin) {
  if (pin) { const salt=crypto.getRandomValues(new Uint8Array(32)),sb=b64(salt.buffer);
    crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey'])
      .then(dk=>crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},dk,{name:'AES-GCM',length:256},false,['encrypt','decrypt']))
      .then(key=>{const iv=crypto.getRandomValues(new Uint8Array(12)); crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(k)).then(ct=>localStorage.setItem(SK,JSON.stringify({data:b64(ct),iv:b64(iv.buffer),salt:sb,pinned:true})));});
  } else { localStorage.setItem(SK,JSON.stringify({data:k,pinned:false})); }
}
async function loadPrivateKey(pin) { const r=localStorage.getItem(SK); if (!r) return null; const o=JSON.parse(r); if (o.pinned) { if (!pin) return null; try { const salt=fromB64(o.salt); const dk=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']); const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},dk,{name:'AES-GCM',length:256},false,['decrypt']); return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(fromB64(o.iv))},key,fromB64(o.data))); } catch { return null; } } return o.data; }
function clearPrivateKey() { localStorage.removeItem(SK); }

// ============ Emoji Data ============
const EMOJI_CATEGORIES = [
  { name:'Smileys', icon:'😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👻','👽','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙈','🙉','🙊','💋','💌','💘','💝','💖','💗','💓','💞','💕','💟','❣️','💔','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','💭','💤','👋','🤚','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','👀','👁️','👅','👄','👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🙇','🤦','🤷','💆','💇','🚶','🏃','💃','🕺','👯','🧖','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣','🏊','⛹️','🏋️','🚴','🚵','🤸','🤼','🤽','🤾','🤹','🧘','🛀','👭','👫','👬','💏','💑','👪'] },
  { name:'Animals', icon:'🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🪰','🦟','🦗','🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🐈','🐓','🦃','🦚','🦜','🦢','🕊️','🐇','🦝','🦔','🐾','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🎍','🪴','🎋','🍃','🍂','🍁','🍄','🐚','🌾','💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌎','🌍','🌏','🪐','💫','⭐','🌟','✨','⚡','☄️','💥','🔥','🌪️','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','💧','💦','☔','🌫️','🌊'] },
  { name:'Food', icon:'🍎', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🌽','🥕','🥔','🍠','🥐','🍞','🥖','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥠','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🥤','🧋','🧊','🧃','🥢','🍽️','🍴','🥄','🔪','🏺'] },
  { name:'Activities', icon:'⚽', emojis: ['⚽','⚾','🏀','🏐','🏈','🏉','🎾','🥏','🎳','🏏','🏑','🏒','🥍','🏓','🏸','🥊','🥋','🥅','⛳','⛸️','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🪀','🪁','🎱','🔮','🪄','🧿','🎮','🕹️','🎰','🎲','🧩','🧸','🪆','♠️','♥️','♦️','♣️','♟️','🃏','🀄','🎴','🎭','🖼️','🎨','🧵','🧶','🪢','🎉','🎊','🎈','🎁','🎗️','🎟️','🎫','🏆','🏅','🥇','🥈','🥉','🎖️','🏵️','🎗️'] },
  { name:'Travel', icon:'🚗', emojis: ['🚗','🚕','🚙','🚌','🚎','🚐','🚑','🚒','🚓','🚔','🚖','🚛','🚜','🏎️','🏍️','🛵','🦽','🦼','🛺','🚲','🛴','🛹','🛼','🚨','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','⛽','🚧','🚦','🚥','🚏','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','💒','教堂','🕌','🛕','🕍','⛩️','🕋','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♨️','🌌'] },
  { name:'Objects', icon:'⌚', emojis: ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🧰','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪒','🧽','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'] },
  { name:'Symbols', icon:'❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','♾️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','👁️‍🗨️','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛'] },
  { name:'Flags', icon:'🏁', emojis: ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇺🇸','🇬🇧','🇨🇦','🇦🇺','🇩🇪','🇫🇷','🇮🇹','🇪🇸','🇳🇱','🇧🇪','🇸🇪','🇨🇭','🇦🇹','🇮🇪','🇵🇹','🇬🇷','🇩🇰','🇫🇮','🇳🇴','🇸🇪','🇵🇱','🇷🇺','🇺🇦','🇹🇷','🇪🇬','🇿🇦','🇿🇼','🇳🇬','🇰🇪','🇪🇹','🇲🇦','🇩🇿','🇹🇳','🇱🇾','🇸🇩','🇮🇶','🇮🇷','🇸🇦','🇦🇪','🇶🇦','🇰🇼','🇧🇭','🇯🇴','🇱🇧','🇸🇾','🇮🇱','🇮🇳','🇵🇰','🇧🇩','🇱🇰','🇳🇵','🇲🇻','🇧🇹','🇲🇲','🇹🇭','🇻🇳','🇱🇦','🇰🇭','🇲🇾','🇸🇬','🇮🇩','🇵🇭','🇧🇷','🇦🇷','🇨🇱','🇨🇴','🇵🇪','🇻🇪','🇪🇨','🇧🇴','🇵🇾','🇺🇾','🇲🇽','🇯🇲','🇨🇺','🇩🇴','🇭🇹','🇵🇷','🇬🇹','🇭🇳','🇳🇮','🇨🇷','🇵🇦','🇰🇷','🇯🇵','🇨🇳','🇭🇰','🇹🇼','🇸🇬','🇲🇴','🇻🇳','🇹🇭','🇰🇵','🇲🇳'] },
];

// ============ DOM Helpers ============
function $(id) { return document.getElementById(id); }
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}
function avatarEl(src, name, id, size) {
  if (src) { return el('div', { class: 'chat-avatar', style: size ? `width:${size}px;height:${size}px` : '' }, el('img', { src })); }
  return el('div', { class: 'chat-avatar', style: `background:${avatarColor(id)};${size?`width:${size}px;height:${size}px`:''}` }, initials(name));
}

// ============ Auth ============
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) { await initSession(session.user); }
  State.authReady = true;
  showApp();
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) initSession(session.user).then(showApp);
    else if (event === 'SIGNED_OUT') { State.user = null; State.profile = null; State.chats = []; State.messages = {}; clearPrivateKey(); showApp(); }
  });
}

async function initSession(user) {
  State.user = user;
  State.privateKey = await loadPrivateKey();
  await loadProfile();
  await loadProfiles();
  await loadChats();
  setupRealtime();
}

function showApp() {
  $('splash').classList.add('hidden');
  if (!State.user) { $('auth').classList.remove('hidden'); $('main').classList.add('hidden'); }
  else { $('auth').classList.add('hidden'); $('main').classList.remove('hidden'); renderSidebar(); renderSidebarFooter(); }
}

function switchAuthTab(mode) {
  State.authMode = mode;
  $('tab-login').classList.toggle('active', mode === 'login');
  $('tab-signup').classList.toggle('active', mode === 'signup');
  $('signup-fields').classList.toggle('hidden', mode !== 'signup');
  $('signup-pin').classList.toggle('hidden', mode !== 'signup');
  $('auth-submit').textContent = mode === 'login' ? 'Log In' : 'Create Account';
  $('pw-strength').classList.toggle('hidden', mode !== 'signup' || !$('auth-password').value);
}

function onPwInput() {
  if (State.authMode !== 'signup') return;
  const p = $('auth-password').value;
  if (!p) { $('pw-strength').classList.add('hidden'); return; }
  $('pw-strength').classList.remove('hidden');
  let ps = 0;
  if (p.length >= 8) ps++; if (p.length >= 12) ps++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) ps++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) ps++;
  const colors = ['#ef4444','#f97316','#eab308','#22c55e'];
  const labels = ['Weak','Fair','Good','Strong'];
  $('strength-fill').style.cssText = `width:${(ps/4)*100}%;background:${colors[ps-1]||'#ef4444'}`;
  $('strength-label').textContent = labels[ps-1] || 'Weak';
}

async function handleAuth(e) {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const errEl = $('auth-error');
  errEl.classList.add('hidden');
  $('auth-submit').disabled = true;
  $('auth-submit').textContent = 'Please wait...';
  try {
    if (State.authMode === 'login') {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await initSession(data.user);
      showApp();
    } else {
      const fullName = sanitizeName($('auth-fullname').value);
      const username = sanitizeUsername($('auth-username').value);
      const pin = $('auth-pin').value || null;
      if (!fullName) throw new Error('Full name is required');
      if (username.length < 3) throw new Error('Username must be at least 3 characters');
      const pwErr = validatePassword(password);
      if (pwErr) throw new Error(pwErr);
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('Signup failed');
      const kp = await generateKeyPair();
      storePrivateKey(kp.privateKey, pin);
      const { error: pe } = await sb.from('profiles').insert({
        id: data.user.id, username, full_name: fullName, public_key: kp.publicKey,
        bio: "Hey there! I'm using NUVORA."
      });
      if (pe) throw pe;
      await initSession(data.user);
      showApp();
    }
  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong';
    errEl.classList.remove('hidden');
  } finally {
    $('auth-submit').disabled = false;
    $('auth-submit').textContent = State.authMode === 'login' ? 'Log In' : 'Create Account';
  }
}

async function signOut() {
  await sb.auth.signOut();
  clearPrivateKey();
  State.user = null; State.profile = null; State.chats = []; State.messages = {};
  State.realtimeChannels.forEach(c => c.unsubscribe());
  State.realtimeChannels = [];
  showApp();
}

// ============ Data Loading ============
async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', State.user.id).maybeSingle();
  State.profile = data;
}

async function loadProfiles() {
  const { data } = await sb.from('profiles').select('id,username,full_name,avatar_url,public_key,is_online,bio');
  (data || []).forEach(p => State.profiles[p.id] = p);
}

async function loadChats() {
  const { data: ms } = await sb.from('chat_members').select('chat_id,muted,joined_at,chats(*)').eq('user_id', State.user.id);
  if (!ms) return;
  const chats = ms.map(m => m.chats ? { ...m.chats, myMember: { muted: m.muted } } : null).filter(Boolean);
  const ids = new Set();
  chats.forEach(c => { if (c.members) c.members.forEach(id => ids.add(id)); });
  // Load members for each chat
  for (const c of chats) {
    const { data: members } = await sb.from('chat_members').select('user_id').eq('chat_id', c.id);
    c.members = (members || []).map(m => m.user_id);
    (c.members || []).forEach(id => ids.add(id));
  }
  if (ids.size) {
    const { data: profiles } = await sb.from('profiles').select('id,username,full_name,avatar_url,public_key,is_online').in('id', [...ids]);
    (profiles || []).forEach(p => State.profiles[p.id] = p);
  }
  // Load last message for each chat
  for (const c of chats) {
    const { data: lm } = await sb.from('messages').select('*').eq('chat_id', c.id).order('created_at', { ascending: false }).limit(1);
    if (lm?.[0]) c.lastMessage = lm[0];
  }
  State.chats = chats;
  renderSidebar();
  renderSidebarFooter();
}

async function loadMessages(chatId) {
  const { data } = await sb.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true }).limit(200);
  const { data: reactions } = await sb.from('reactions').select('*').in('message_id', (data || []).map(m => m.id));
  const pk = State.privateKey, profiles = State.profiles, user = State.user;
  const chat = State.chats.find(c => c.id === chatId);
  const decrypted = [];
  for (const m of (data || [])) {
    let txt = '';
    if (m.encrypted_content && pk && !m.is_deleted) {
      const oid = m.sender_id === user.id ? otherMemberId(chatId) : m.sender_id;
      const peer = profiles[oid];
      if (peer?.public_key) {
        if (m.iv === 'none' || m.iv === 'group') { try { txt = decodeURIComponent(escape(atob(m.encrypted_content))); } catch {} }
        else txt = await decryptMessage(m.encrypted_content, m.iv, pk, peer.public_key);
      }
    }
    decrypted.push({ ...m, decrypted: txt, reactions: (reactions || []).filter(r => r.message_id === m.id) });
  }
  State.messages[chatId] = decrypted;
  renderMessages(chatId);
}

function otherMemberId(chatId) {
  const c = State.chats.find(c => c.id === chatId);
  if (!c || c.type !== 'direct' || !c.members) return null;
  return c.members.find(id => id !== State.user?.id);
}

async function markRead(chatId) {
  await sb.from('chat_members').update({ last_read_at: new Date().toISOString() }).eq('chat_id', chatId).eq('user_id', State.user.id);
}

// ============ Messaging ============
async function sendMessage(chatId, text, opts = {}) {
  const { replyTo, messageType = 'text', mediaUrl = null } = opts;
  if (!rateLimitCheck()) throw new Error('Rate limit exceeded');
  const txt = sanitizeInput(text);
  if (!txt && messageType === 'text') return;
  const pk = State.privateKey, u = State.user;
  const chat = State.chats.find(c => c.id === chatId);
  if (!chat) return;
  let enc2 = { ciphertext: '', iv: '' };
  if (pk && chat.type === 'direct') {
    const oid = otherMemberId(chatId);
    const peer = State.profiles[oid];
    if (peer?.public_key) enc2 = await encryptMessage(txt, pk, peer.public_key);
  } else {
    enc2 = { ciphertext: btoa(unescape(encodeURIComponent(txt))), iv: 'none' };
  }
  const { data, error } = await sb.from('messages').insert({
    chat_id: chatId, sender_id: u.id, encrypted_content: enc2.ciphertext, iv: enc2.iv,
    message_type: messageType, media_url: mediaUrl, reply_to_id: replyTo || null,
  content: messageType === 'text' ? txt : null
  }).select('*').single();
  if (error) throw error;
  if (!State.messages[chatId]) State.messages[chatId] = [];
  State.messages[chatId].push({ ...data, decrypted: txt, reactions: [] });
  renderMessages(chatId);
  loadChats();
}

async function editMessage(id, newText) {
  const txt = sanitizeInput(newText);
  if (!txt) return;
  const pk = State.privateKey;
  const msg = findMsg(id);
  if (!msg) return;
  const chat = State.chats.find(c => c.id === msg.chat_id);
  let enc2 = { ciphertext: btoa(unescape(encodeURIComponent(txt))), iv: 'none' };
  if (pk && chat?.type === 'direct') {
    const oid = otherMemberId(msg.chat_id);
    const peer = State.profiles[oid];
    if (peer?.public_key) enc2 = await encryptMessage(txt, pk, peer.public_key);
  }
  await sb.from('messages').update({ encrypted_content: enc2.ciphertext, iv: enc2.iv, is_edited: true, content: txt }).eq('id', id);
  if (State.messages[msg.chat_id]) {
    State.messages[msg.chat_id] = State.messages[msg.chat_id].map(m =>
      m.id === id ? { ...m, decrypted: txt, is_edited: true } : m
    );
    renderMessages(msg.chat_id);
  }
}

async function deleteMessage(id, forAll) {
  if (forAll) await sb.from('messages').update({ is_deleted: true, encrypted_content: '', iv: '', content: null }).eq('id', id);
  else await sb.from('messages').delete().eq('id', id);
  const msg = findMsg(id);
  if (msg && State.messages[msg.chat_id]) {
    State.messages[msg.chat_id] = forAll
      ? State.messages[msg.chat_id].map(m => m.id === id ? { ...m, is_deleted: true, decrypted: '' } : m)
      : State.messages[msg.chat_id].filter(m => m.id !== id);
    renderMessages(msg.chat_id);
  }
}

async function toggleReaction(msgId, emoji) {
  const { data: ex } = await sb.from('reactions').select('*').eq('message_id', msgId).eq('user_id', State.user.id).maybeSingle();
  if (ex) {
    if (ex.emoji === emoji) await sb.from('reactions').delete().eq('id', ex.id);
    else await sb.from('reactions').update({ emoji }).eq('id', ex.id);
  } else {
    await sb.from('reactions').insert({ message_id: msgId, user_id: State.user.id, emoji });
  }
}

function findMsg(id) {
  for (const cid in State.messages) {
    const m = State.messages[cid].find(x => x.id === id);
    if (m) return m;
  }
  return null;
}

// ============ Chat Management ============
async function startDirectChat(otherId) {
  const { data: myChats } = await sb.from('chat_members').select('chat_id').eq('user_id', State.user.id);
  if (myChats) for (const mc of myChats) {
    const { data: chat } = await sb.from('chats').select('*').eq('id', mc.chat_id).maybeSingle();
    if (chat?.type === 'direct') {
      const { data: members } = await sb.from('chat_members').select('user_id').eq('chat_id', chat.id);
      const ids = (members || []).map(m => m.user_id);
      if (ids.includes(otherId) && ids.length === 2) { await loadChats(); return chat.id; }
    }
  }
  const { data: chat, error } = await sb.from('chats').insert({ type: 'direct' }).select('*').single();
  if (error) throw error;
  await sb.from('chat_members').insert([
    { chat_id: chat.id, user_id: State.user.id },
    { chat_id: chat.id, user_id: otherId }
  ]);
  await loadChats();
  return chat.id;
}

async function createGroup(name, memberIds) {
  const all = [...new Set([State.user.id, ...memberIds])];
  const { data: chat, error } = await sb.from('chats').insert({ type: 'group', name }).select('*').single();
  if (error) throw error;
  await sb.from('chat_members').insert(all.map(id => ({ chat_id: chat.id, user_id: id })));
  await loadChats();
  return chat.id;
}

// ============ Profile ============
async function updateProfile(updates) {
  const { error } = await sb.from('profiles').update(updates).eq('id', State.user.id);
  if (error) throw error;
  await loadProfile();
  await loadProfiles();
  renderSidebarFooter();
}

async function updateName(newName) {
  const clean = sanitizeName(newName);
  if (!clean) throw new Error('Name is required');
  if (clean === State.profile?.full_name) throw new Error('This is already your name');
  if (State.profile?.name_changed_at) {
    const days = Math.floor((Date.now() - new Date(State.profile.name_changed_at).getTime()) / (1000*60*60*24));
    if (days < 60) { const left = 60 - days; throw new Error(`You can change your name again in ${left} day${left===1?'':'s'}`); }
  }
  const { error } = await sb.from('profiles').update({ full_name: clean, name_changed_at: new Date().toISOString() }).eq('id', State.user.id);
  if (error) throw error;
  await loadProfile();
  await loadProfiles();
  renderSidebarFooter();
}

async function uploadAvatar(file) {
  const ext = file.name.split('.').pop();
  const path = `${State.user.id}/avatar.${ext}`;
  const { error } = await sb.storage.from('media').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = sb.storage.from('media').getPublicUrl(path);
  await updateProfile({ avatar_url: data.publicUrl });
}

// ============ Rendering ============
function renderSidebar() {
  const list = $('chat-list');
  list.innerHTML = '';
  const search = $('chat-search').value.toLowerCase();
  const filtered = State.chats.filter(c => {
    if (!search) return true;
    const name = c.type === 'group' ? c.name : State.profiles[otherMemberId(c.id)]?.full_name || '';
    return name.toLowerCase().includes(search);
  });
  if (filtered.length === 0) {
    list.appendChild(el('div', { style: 'padding:32px 16px;text-align:center;color:var(--subtext);font-size:14px' }, 'No chats yet. Tap the compose icon to start.'));
    return;
  }
  for (const chat of filtered) {
    const ou = chat.type === 'direct' ? State.profiles[chat.members?.find(id => id !== State.user?.id)] : null;
    const name = chat.type === 'group' ? chat.name : ou?.full_name || 'Unknown';
    const avatar = chat.type === 'group' ? chat.avatar_url : ou?.avatar_url;
    const lm = chat.lastMessage;
    const isActive = State.activeChat === chat.id;
    const item = el('div', { class: `chat-item${isActive ? ' active' : ''}`, onclick: () => navigate(`chat:${chat.id}`) },
      el('div', { class: 'chat-avatar' }, avatar ? el('img', { src: avatar }) : el('div', { style: `background:${avatarColor(ou?.id||chat.id)};width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center` }, chat.type === 'group' ? '👥' : initials(name))),
      el('div', { class: 'chat-info' },
        el('div', { class: 'chat-info-top' },
          el('span', { class: 'chat-name' }, name),
          lm && el('span', { class: 'chat-time' }, formatTime(lm.created_at))
        ),
        el('span', { class: 'chat-preview' }, lm?.sender_id === State.user?.id ? 'You: ' : '', getMessagePreview({ ...lm, decrypted: lm?.decrypted }))
      )
    );
    list.appendChild(item);
  }
}

function renderSidebarFooter() {
  const ft = $('sidebar-footer');
  ft.innerHTML = '';
  const p = State.profile;
  if (!p) return;
  ft.appendChild(avatarEl(p.avatar_url, p.full_name, State.user.id, 40));
  ft.appendChild(el('div', { class: 'chat-info' },
    el('div', { class: 'chat-info-top' }, el('span', { class: 'chat-name' }, p.full_name || '')),
    el('span', { class: 'chat-preview' }, '@' + (p.username || ''))
  ));
  ft.appendChild(el('button', { onclick: (e) => { e.stopPropagation(); signOut(); } }, el('i', { class: 'bx bx-log-out' })));
}

function renderMessages(chatId) {
  const container = $('messages-container');
  container.innerHTML = '';
  const inner = el('div', { class: 'messages-inner' });
  inner.appendChild(el('div', { class: 'encryption-notice' }, el('span', null, el('i', { class: 'bx bx-lock-alt' }), ' Messages are end-to-end encrypted.')));
  const msgs = State.messages[chatId] || [];
  let lastDate = '';
  for (const m of msgs) {
    const d = formatDate(m.created_at);
    if (d !== lastDate) {
      inner.appendChild(el('div', { class: 'date-separator' }, el('span', null, d)));
      lastDate = d;
    }
    inner.appendChild(renderBubble(m, chatId));
  }
  container.appendChild(inner);
  container.scrollTop = container.scrollHeight;
}

function renderBubble(m, chatId) {
  const mine = m.sender_id === State.user?.id;
  const sender = State.profiles[m.sender_id];
  const chat = State.chats.find(c => c.id === chatId);
  if (m.is_deleted) {
    return el('div', { class: `message${mine ? ' mine' : ''} deleted` },
      el('div', { class: 'message-bubble' }, el('i', { class: 'bx bx-block' }), ' This message was deleted')
    );
  }
  const bubble = el('div', { class: 'message-bubble', oncontextmenu: (e) => { e.preventDefault(); showMsgMenu(e, m); }, ontouchstart: (e) => { const t = setTimeout(() => showMsgMenu({ preventDefault: () => {}, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }, m), 500); e.target.addEventListener('touchend', () => clearTimeout(t), { once: true }); } });
  if (!mine && chat?.type === 'group' && sender) {
    bubble.appendChild(el('div', { class: 'message-sender', style: `color:${avatarColor(sender.id)}` }, sender.full_name));
  }
  // Content
  if (m.message_type === 'image' && m.media_url) {
    bubble.appendChild(el('img', { class: 'media', src: m.media_url }));
  } else if (m.message_type === 'video' && m.media_url) {
    bubble.appendChild(el('video', { class: 'media', src: m.media_url, controls: true }));
  } else if ((m.message_type === 'voice' || m.message_type === 'audio') && m.media_url) {
    bubble.appendChild(el('audio', { class: 'media', src: m.media_url, controls: true }));
  } else if (m.message_type === 'document' && m.media_url) {
    bubble.appendChild(el('a', { class: 'media-download', href: m.media_url, download: true }, el('i', { class: 'bx bx-file' }), ' Download'));
  } else {
    bubble.appendChild(el('span', { class: 'message-text' }, m.decrypted || m.content || '[Encrypted]'));
  }
  // Meta
  const meta = el('div', { class: 'message-meta' });
  if (m.is_edited) meta.appendChild(el('span', { class: 'message-time', style: 'font-style:italic' }, 'edited '));
  meta.appendChild(el('span', { class: 'message-time' }, formatTime(m.created_at)));
  if (mine) meta.appendChild(el('i', { class: 'bx bx-check-double msg-check' }));
  bubble.appendChild(meta);
  // Reactions
  if (m.reactions?.length > 0) {
    const rc = {};
    m.reactions.forEach(r => { rc[r.emoji] = (rc[r.emoji] || 0) + 1; });
    const rDiv = el('div', { class: 'message-reactions' });
    for (const [e, c] of Object.entries(rc)) rDiv.appendChild(el('span', null, e + (c > 1 ? c : '')));
    bubble.appendChild(rDiv);
  }
  // Star
  if (State.starredIds.has(m.id)) {
    bubble.appendChild(el('i', { class: 'bx bxs-star message-star' }));
  }
  const msgEl = el('div', { class: `message${mine ? ' mine' : ''}${m.is_edited ? ' edited' : ''}` }, bubble);
  return msgEl;
}

function renderProfile() {
  const screen = $('profile-screen');
  screen.innerHTML = '';
  screen.classList.add('active');
  $('sidebar').classList.add('hidden-md');
  $('chat-window').classList.add('hidden-md');
  $('empty-state').classList.add('hidden-md');
  const p = State.profile;
  const cooldown = (() => {
    if (!p?.name_changed_at) return 0;
    const d = Math.floor((Date.now() - new Date(p.name_changed_at).getTime()) / (1000*60*60*24));
    return d >= 60 ? 0 : 60 - d;
  })();
  const canChange = cooldown === 0;
  screen.appendChild(el('div', { class: 'panel-header' },
    el('button', { onclick: () => navigate('') }, el('i', { class: 'bx bx-arrow-back' })),
    el('h2', null, 'Profile')
  ));
  const body = el('div', { class: 'panel-body' });
  // Avatar
  const avatarWrap = el('div', { class: 'profile-avatar-wrap' });
  const avatarDiv = el('div', { class: 'profile-avatar', style: `background:${avatarColor(State.user.id)}` }, p?.avatar_url ? el('img', { src: p.avatar_url }) : initials(p?.full_name || 'U'));
  const label = el('label', null, el('i', { class: 'bx bx-camera' }), el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => { if (e.target.files[0]) uploadAvatar(e.target.files[0]).catch(err => alert(err.message)); } }));
  avatarDiv.appendChild(label);
  avatarWrap.appendChild(avatarDiv);
  body.appendChild(avatarWrap);
  // Name
  body.appendChild(el('div', { class: 'profile-field' },
    el('label', null, 'Name'),
    el('div', { class: 'field-row' },
      el('div', { class: 'field-value' }, p?.full_name || ''),
      el('button', { class: 'edit-btn', onclick: () => startEditProfile() }, el('i', { class: 'bx bx-edit' }))
    ),
    !canChange && el('div', { class: 'cooldown-text' }, el('i', { class: 'bx bx-time' }), ` You can change your name again in ${cooldown} day${cooldown === 1 ? '' : 's'}`)
  ));
  // Bio
  body.appendChild(el('div', { class: 'profile-field' },
    el('label', null, 'Bio'),
    el('div', { class: 'field-row' },
      el('div', { class: 'field-value' }, p?.bio || 'No bio yet'),
      el('button', { class: 'edit-btn', onclick: () => startEditProfile() }, el('i', { class: 'bx bx-edit' }))
    )
  ));
  body.appendChild(el('div', { class: 'profile-field' }, el('label', null, 'Username'), el('div', { class: 'field-value' }, '@' + (p?.username || ''))));
  body.appendChild(el('div', { class: 'profile-field' }, el('label', null, 'Email'), el('div', { class: 'field-value' }, State.user?.email || '')));
  body.appendChild(el('div', { class: 'security-card' },
    el('div', { class: 'sec-title' }, el('i', { class: 'bx bx-lock-alt' }), el('span', null, 'End-to-end encrypted')),
    el('p', null, 'Your messages are encrypted with AES-GCM 256-bit encryption.')
  ));
  screen.appendChild(body);
}

let _editName = '', _editBio = '';
function startEditProfile() {
  _editName = State.profile?.full_name || '';
  _editBio = State.profile?.bio || '';
  State.editing = true;
  renderProfileEdit();
}
function renderProfileEdit() {
  const screen = $('profile-screen');
  screen.innerHTML = '';
  screen.classList.add('active');
  const p = State.profile;
  const cooldown = (() => {
    if (!p?.name_changed_at) return 0;
    const d = Math.floor((Date.now() - new Date(p.name_changed_at).getTime()) / (1000*60*60*24));
    return d >= 60 ? 0 : 60 - d;
  })();
  const canChange = cooldown === 0;
  screen.appendChild(el('div', { class: 'panel-header' },
    el('button', { onclick: () => { State.editing = false; renderProfile(); } }, el('i', { class: 'bx bx-arrow-back' })),
    el('h2', null, 'Edit Profile')
  ));
  const body = el('div', { class: 'panel-body' });
  body.appendChild(el('div', { class: 'profile-field' },
    el('label', null, 'Name'),
    el('input', { type: 'text', value: _editName, maxlength: '100', oninput: (e) => _editName = e.target.value }),
    !canChange && _editName !== p?.full_name && el('div', { class: 'cooldown-text' }, el('i', { class: 'bx bx-time' }), ` Name change locked. ${cooldown} day${cooldown === 1 ? '' : 's'} remaining.`)
  ));
  body.appendChild(el('div', { class: 'profile-field' },
    el('label', null, 'Bio'),
    el('textarea', { maxlength: '200', rows: '3', oninput: (e) => _editBio = e.target.value }, _editBio)
  ));
  body.appendChild(el('div', { class: 'profile-buttons' },
    el('button', { class: 'btn-save', onclick: async () => {
      try {
        if (_editName !== p?.full_name) { if (!canChange) { alert(`You can change your name again in ${cooldown} day${cooldown === 1 ? '' : 's'}`); return; } await updateName(_editName); }
        if (_editBio !== p?.bio) await updateProfile({ bio: _editBio.slice(0, 200) });
        State.editing = false; renderProfile();
      } catch (err) { alert(err.message); }
    } }, 'Save'),
    el('button', { class: 'btn-cancel', onclick: () => { State.editing = false; renderProfile(); } }, 'Cancel')
  ));
  screen.appendChild(body);
}

function renderSettings() {
  const screen = $('settings-screen');
  screen.innerHTML = '';
  screen.classList.add('active');
  $('sidebar').classList.add('hidden-md');
  $('chat-window').classList.add('hidden-md');
  $('empty-state').classList.add('hidden-md');
  screen.appendChild(el('div', { class: 'panel-header' },
    el('button', { onclick: () => navigate('') }, el('i', { class: 'bx bx-arrow-back' })),
    el('h2', null, 'Settings')
  ));
  const body = el('div', { class: 'panel-body' });
  // Theme
  body.appendChild(el('div', { class: 'settings-section' },
    el('h3', null, 'Appearance'),
    el('div', { class: 'theme-toggle' },
      el('button', { class: State.settings.theme === 'dark' ? 'active' : '', onclick: () => { State.settings.theme = 'dark'; document.documentElement.classList.add('dark'); renderSettings(); } }, el('i', { class: 'bx bx-moon' }), ' Dark'),
      el('button', { class: State.settings.theme === 'light' ? 'active' : '', onclick: () => { State.settings.theme = 'light'; document.documentElement.classList.remove('dark'); renderSettings(); } }, el('i', { class: 'bx bx-sun' }), ' Light')
    )
  ));
  // Notifications
  body.appendChild(el('div', { class: 'settings-section' },
    el('h3', null, 'Notifications'),
    el('div', { class: 'settings-row', onclick: () => { State.settings.notifications = !State.settings.notifications; renderSettings(); } },
      el('span', null, 'Message notifications'),
      el('div', { class: `toggle-switch${State.settings.notifications ? ' on' : ''}` }, el('div', { class: 'knob' }))
    )
  ));
  // Security
  body.appendChild(el('div', { class: 'settings-section' },
    el('h3', null, 'Security'),
    el('div', { class: 'settings-row' }, el('span', null, 'End-to-end encryption'), el('span', { class: 'val' }, 'Enabled')),
    el('div', { class: 'settings-row' }, el('span', null, 'E2EE Key'), el('span', { class: 'val' }, 'Generated')),
    el('div', { class: 'settings-row' }, el('span', null, 'Zero-knowledge'), el('span', { class: 'val' }, 'Active'))
  ));
  // Account
  body.appendChild(el('div', { class: 'settings-section' },
    el('h3', null, 'Account'),
    el('div', { class: 'settings-row' }, el('span', null, 'Name'), el('span', { class: 'val' }, State.profile?.full_name || '')),
    el('div', { class: 'settings-row' }, el('span', null, 'Username'), el('span', { class: 'val' }, '@' + (State.profile?.username || '')))
  ));
  body.appendChild(el('button', { class: 'logout-btn', onclick: signOut }, el('i', { class: 'bx bx-log-out' }), ' Log Out'));
  screen.appendChild(body);
}

function renderPeople() {
  const screen = $('people-screen');
  screen.innerHTML = '';
  screen.classList.add('active');
  $('sidebar').classList.add('hidden-md');
  $('chat-window').classList.add('hidden-md');
  $('empty-state').classList.add('hidden-md');
  screen.appendChild(el('div', { class: 'panel-header' },
    el('button', { onclick: () => navigate('') }, el('i', { class: 'bx bx-arrow-back' })),
    el('h2', null, 'People')
  ));
  const list = el('div', { class: 'people-list' });
  const all = Object.values(State.profiles).filter(p => p.id !== State.user?.id);
  if (all.length === 0) {
    list.appendChild(el('div', { style: 'padding:32px 16px;text-align:center;color:var(--subtext);font-size:14px' }, 'No other users yet.'));
  } else {
    for (const p of all) {
      const item = el('div', { class: 'person-item', onclick: async () => { const cid = await startDirectChat(p.id); navigate(`chat:${cid}`); } },
        avatarEl(p.avatar_url, p.full_name, p.id, 48),
        el('div', { class: 'person-info' },
          el('div', { class: 'person-name' }, p.full_name),
          el('div', { class: 'person-sub' }, '@' + p.username + (p.bio ? ` · ${p.bio}` : ''))
        ),
        el('i', { class: 'bx bx-message-rounded' })
      );
      list.appendChild(item);
    }
  }
  screen.appendChild(list);
}

function renderChatHeader(chatId) {
  const chat = State.chats.find(c => c.id === chatId);
  const header = $('chat-header');
  header.innerHTML = '';
  if (!chat) return;
  const ou = chat.type === 'direct' ? State.profiles[chat.members?.find(id => id !== State.user?.id)] : null;
  const name = chat.type === 'group' ? chat.name : ou?.full_name || 'Unknown';
  const avatar = chat.type === 'group' ? chat.avatar_url : ou?.avatar_url;
  header.appendChild(el('button', { class: 'back-btn', onclick: () => navigate('') }, el('i', { class: 'bx bx-arrow-back' })));
  header.appendChild(avatarEl(avatar, name, ou?.id || chatId, 40));
  header.appendChild(el('div', { class: 'chat-header-info' },
    el('div', { class: 'chat-header-name' }, name),
    el('div', { class: 'chat-header-status' }, chat.type === 'group' ? `${chat.members?.length || 0} members` : (ou?.is_online ? 'Online' : 'Last seen recently'))
  ));
  const actions = el('div', { class: 'chat-header-actions' });
  actions.appendChild(el('button', { onclick: () => startCall('voice', ou?.id) }, el('i', { class: 'bx bx-phone' })));
  actions.appendChild(el('button', { onclick: () => startCall('video', ou?.id) }, el('i', { class: 'bx bx-video' })));
  actions.appendChild(el('button', { onclick: toggleSearch }, el('i', { class: 'bx bx-search' })));
  header.appendChild(actions);
}

// ============ Navigation ============
function navigate(route) {
  // Hide all panels
  $('profile-screen').classList.remove('active');
  $('settings-screen').classList.remove('active');
  $('people-screen').classList.remove('active');
  $('sidebar').classList.remove('hidden-md');
  $('chat-window').classList.remove('hidden-md');
  $('empty-state').classList.remove('hidden-md');
  if (route === 'profile') { renderProfile(); return; }
  if (route === 'settings') { renderSettings(); return; }
  if (route === 'people') { renderPeople(); return; }
  if (route && route.startsWith('chat:')) {
    const chatId = route.split(':')[1];
    State.activeChat = chatId;
    $('chat-window').classList.remove('hidden-md');
    $('empty-state').classList.add('hidden-md');
    $('sidebar').classList.remove('hidden-md');
    renderChatHeader(chatId);
    loadMessages(chatId);
    markRead(chatId);
    // On mobile, show chat window
    if (window.innerWidth < 768) { $('chat-window').classList.add('show'); $('sidebar').style.display = 'none'; }
    renderSidebar();
    return;
  }
  // Default: show sidebar + empty state
  State.activeChat = null;
  $('chat-window').classList.add('hidden-md');
  $('empty-state').classList.remove('hidden-md');
  renderSidebar();
}

// ============ Input Handling ============
function onInputChange(textarea) {
  // Auto-resize
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';
  // Send button state
  const hasText = textarea.value.trim().length > 0;
  $('send-btn').disabled = !hasText && !State.editTarget;
  $('send-btn').classList.toggle('ready', hasText);
  $('send-btn').querySelector('i').className = hasText ? 'bx bxs-send' : 'bx bx-microphone';
  // Broadcast typing
  if (State.activeChat) {
    const ch = sb.channel(`typing-${State.activeChat}`);
    ch.send({ type: 'broadcast', event: 'typing', payload: { userId: State.user.id, name: State.profile?.full_name } });
  }
}

function onInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
}

async function handleSend() {
  const input = $('message-input');
  const text = input.value.trim();
  if (!text && !State.editTarget) return;
  input.value = '';
  input.style.height = 'auto';
  $('send-btn').disabled = true;
  $('send-btn').classList.remove('ready');
  $('send-btn').querySelector('i').className = 'bx bx-microphone';
  try {
    if (State.editTarget) {
      await editMessage(State.editTarget.id, text);
      State.editTarget = null;
      $('edit-bar').classList.add('hidden');
    } else {
      await sendMessage(State.activeChat, text, { replyTo: State.replyTo?.id });
      State.replyTo = null;
      $('reply-bar').classList.add('hidden');
    }
    playSound();
  } catch (err) { alert(err.message); }
}

// ============ Reply / Edit ============
function setReplyTo(msg) {
  State.replyTo = msg;
  const bar = $('reply-bar');
  bar.innerHTML = '';
  bar.appendChild(el('i', { class: 'bx bx-reply' }));
  bar.appendChild(el('div', { class: 'reply-content' },
    el('div', { class: 'reply-name' }, msg.sender_id === State.user?.id ? 'You' : (State.profiles[msg.sender_id]?.full_name || 'Unknown')),
    el('div', { class: 'reply-text' }, msg.decrypted || msg.content || '[Media]')
  ));
  bar.appendChild(el('button', { onclick: () => { State.replyTo = null; bar.classList.add('hidden'); } }, el('i', { class: 'bx bx-x' })));
  bar.classList.remove('hidden');
}

function setEditTarget(msg) {
  State.editTarget = msg;
  $('message-input').value = msg.decrypted || msg.content || '';
  onInputChange($('message-input'));
  const bar = $('edit-bar');
  bar.innerHTML = '';
  bar.appendChild(el('i', { class: 'bx bx-edit' }));
  bar.appendChild(el('div', { class: 'edit-content' },
    el('div', { class: 'edit-name' }, 'Editing message'),
    el('div', { class: 'edit-text' }, msg.decrypted || msg.content || '')
  ));
  bar.appendChild(el('button', { onclick: () => { State.editTarget = null; bar.classList.add('hidden'); $('message-input').value = ''; onInputChange($('message-input')); } }, el('i', { class: 'bx bx-x' })));
  bar.classList.remove('hidden');
  $('message-input').focus();
}

// ============ Message Menu ============
function showMsgMenu(e, msg) {
  const menu = $('msg-menu');
  menu.innerHTML = '';
  const mine = msg.sender_id === State.user?.id;
  const starred = State.starredIds.has(msg.id);
  const REACTIONS = ['👍','❤️','😂','😮','😢','🙏'];
  const rDiv = el('div', { class: 'reactions' });
  for (const r of REACTIONS) rDiv.appendChild(el('button', { onclick: () => { toggleReaction(msg.id, r); menu.classList.add('hidden'); } }, r));
  menu.appendChild(rDiv);
  const aDiv = el('div', { class: 'actions' });
  aDiv.appendChild(el('button', { onclick: () => { setReplyTo(msg); menu.classList.add('hidden'); } }, el('i', { class: 'bx bx-reply' }), ' Reply'));
  if (msg.message_type === 'text' && mine && !msg.is_deleted) aDiv.appendChild(el('button', { onclick: () => { setEditTarget(msg); menu.classList.add('hidden'); } }, el('i', { class: 'bx bx-edit' }), ' Edit'));
  aDiv.appendChild(el('button', { onclick: () => { navigator.clipboard.writeText(msg.decrypted || msg.content || ''); menu.classList.add('hidden'); } }, el('i', { class: 'bx bx-copy' }), ' Copy'));
  aDiv.appendChild(el('button', { onclick: () => { State.starredIds.has(msg.id) ? State.starredIds.delete(msg.id) : State.starredIds.add(msg.id); renderMessages(State.activeChat); menu.classList.add('hidden'); } }, el('i', { class: 'bx bx-star' }), starred ? ' Unstar' : ' Star'));
  aDiv.appendChild(el('button', { class: 'danger', onclick: () => { deleteMessage(msg.id, false); menu.classList.add('hidden'); } }, el('i', { class: 'bx bx-trash' }), ' Delete for me'));
  if (mine && !msg.is_deleted) aDiv.appendChild(el('button', { class: 'danger', onclick: () => { deleteMessage(msg.id, true); menu.classList.add('hidden'); } }, el('i', { class: 'bx bx-trash' }), ' Delete for everyone'));
  menu.appendChild(aDiv);
  menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 300) + 'px';
  menu.classList.remove('hidden');
  const close = (ev) => { if (!menu.contains(ev.target)) { menu.classList.add('hidden'); document.removeEventListener('mousedown', close); } };
  document.addEventListener('mousedown', close);
}

// ============ Search ============
let _searchMode = false;
function toggleSearch() {
  _searchMode = !_searchMode;
  $('search-bar-inline').classList.toggle('hidden', !_searchMode);
  if (!_searchMode) { $('msg-search').value = ''; renderMessages(State.activeChat); }
}
function closeSearch() { _searchMode = false; $('search-bar-inline').classList.add('hidden'); $('msg-search').value = ''; renderMessages(State.activeChat); }
function searchMessages(query) {
  if (!query) { renderMessages(State.activeChat); return; }
  const msgs = State.messages[State.activeChat] || [];
  const filtered = msgs.filter(m => (m.decrypted || m.content || '').toLowerCase().includes(query.toLowerCase()));
  const container = $('messages-container');
  container.innerHTML = '';
  const inner = el('div', { class: 'messages-inner' });
  for (const m of filtered) inner.appendChild(renderBubble(m, State.activeChat));
  container.appendChild(inner);
}

// ============ Emoji Picker ============
function toggleEmoji() { $('emoji-picker').classList.toggle('hidden'); }
function renderEmojiPicker() {
  const picker = $('emoji-picker');
  picker.innerHTML = '';
  // Search
  const searchDiv = el('div', { class: 'emoji-search' });
  searchDiv.appendChild(el('i', { class: 'bx bx-search' }));
  searchDiv.appendChild(el('input', { type: 'text', placeholder: 'Search emoji', oninput: (e) => { State.emojiSearch = e.target.value; renderEmojiGrid(); } }));
  picker.appendChild(searchDiv);
  // Categories
  if (!State.emojiSearch) {
    const catDiv = el('div', { class: 'emoji-categories' });
    EMOJI_CATEGORIES.forEach((c, i) => {
      catDiv.appendChild(el('button', { class: State.emojiCategory === i ? 'active' : '', onclick: () => { State.emojiCategory = i; renderEmojiPicker(); } }, c.icon));
    });
    picker.appendChild(catDiv);
  }
  // Grid container
  const gridContainer = el('div', { class: 'emoji-grid-container' });
  picker.appendChild(gridContainer);
  renderEmojiGrid();
}
function renderEmojiGrid() {
  const gridContainer = $('emoji-picker .emoji-grid-container');
  if (!gridContainer) return;
  gridContainer.innerHTML = '';
  let cats;
  if (State.emojiSearch) {
    cats = EMOJI_CATEGORIES.map(c => ({ ...c, emojis: c.emojis.filter(e => e.includes(State.emojiSearch)) })).filter(c => c.emojis.length);
  } else {
    cats = [EMOJI_CATEGORIES[State.emojiCategory]];
  }
  if (cats.length === 0) { gridContainer.appendChild(el('div', { style: 'padding:32px;text-align:center;color:var(--subtext)' }, 'No emojis found')); return; }
  for (const c of cats) {
    if (!State.emojiSearch) gridContainer.appendChild(el('div', { class: 'emoji-category-name' }, c.name));
    const grid = el('div', { class: 'emoji-grid' });
    for (const e of c.emojis) {
      grid.appendChild(el('button', { onclick: () => { const input = $('message-input'); input.value += e; input.focus(); onInputChange(input); } }, e));
    }
    gridContainer.appendChild(grid);
  }
}

// ============ New Chat Modal ============
function openNewChat() {
  State.newChatSelected = new Set();
  State.newChatStep = 'select';
  renderNewChatModal();
  $('new-chat-modal').classList.remove('hidden');
}
function closeNewChat(e) { if (e.target === $('new-chat-modal')) $('new-chat-modal').classList.add('hidden'); }
function renderNewChatModal() {
  const body = $('new-chat-body');
  body.innerHTML = '';
  if (State.newChatStep === 'select') {
    body.appendChild(el('div', { class: 'modal-header' },
      el('h2', null, 'New Chat'),
      el('button', { onclick: () => $('new-chat-modal').classList.add('hidden') }, el('i', { class: 'bx bx-x' }))
    ));
    const searchDiv = el('div', { class: 'modal-search' });
    searchDiv.appendChild(el('i', { class: 'bx bx-search' }));
    searchDiv.appendChild(el('input', { type: 'text', placeholder: 'Search people...', oninput: (e) => renderNewChatList(e.target.value) }));
    body.appendChild(searchDiv);
    const list = el('div', { class: 'modal-list', id: 'new-chat-list' });
    body.appendChild(list);
    renderNewChatList('');
    if (State.newChatSelected.size > 0) {
      body.appendChild(el('div', { class: 'modal-footer' },
        el('button', { onclick: nextNewChat }, State.newChatSelected.size === 1 ? 'Start Chat' : `Create Group (${State.newChatSelected.size})`)
      ));
    }
  } else {
    body.appendChild(el('div', { class: 'modal-header' },
      el('h2', null, 'New Group'),
      el('button', { onclick: () => { State.newChatStep = 'select'; renderNewChatModal(); } }, el('i', { class: 'bx bx-arrow-back' }))
    ));
    body.appendChild(el('input', { type: 'text', class: 'modal-input', placeholder: 'Group name', maxlength: '50', id: 'group-name-input' }));
    body.appendChild(el('div', { style: 'padding:0 20px 12px;color:var(--subtext);font-size:14px' }, `${State.newChatSelected.size} members`));
    body.appendChild(el('div', { class: 'modal-footer' },
      el('button', { onclick: createGroupFromModal }, 'Create Group')
    ));
  }
}
function renderNewChatList(search) {
  const list = $('new-chat-list');
  if (!list) return;
  list.innerHTML = '';
  const all = Object.values(State.profiles).filter(p => p.id !== State.user?.id);
  const filtered = all.filter(p => !search || p.full_name.toLowerCase().includes(search.toLowerCase()) || p.username.toLowerCase().includes(search.toLowerCase()));
  for (const p of filtered) {
    const sel = State.newChatSelected.has(p.id);
    const item = el('div', { class: `modal-item${sel ? ' selected' : ''}`, onclick: () => { const n = new Set(State.newChatSelected); n.has(p.id) ? n.delete(p.id) : n.add(p.id); State.newChatSelected = n; renderNewChatModal(); } },
      avatarEl(p.avatar_url, p.full_name, p.id, 44),
      el('div', { class: 'modal-item-info' }, el('div', { class: 'modal-item-name' }, p.full_name), el('div', { class: 'modal-item-sub' }, '@' + p.username)),
      sel && el('i', { class: 'bx bx-check check-icon' })
    );
    list.appendChild(item);
  }
}
async function nextNewChat() {
  if (State.newChatSelected.size === 1) {
    const id = await startDirectChat([...State.newChatSelected][0]);
    $('new-chat-modal').classList.add('hidden');
    navigate(`chat:${id}`);
  } else if (State.newChatSelected.size > 1) {
    State.newChatStep = 'group';
    renderNewChatModal();
  }
}
async function createGroupFromModal() {
  const name = $('group-name-input')?.value.trim() || 'New Group';
  const id = await createGroup(name, [...State.newChatSelected]);
  $('new-chat-modal').classList.add('hidden');
  navigate(`chat:${id}`);
}

// ============ File Upload ============
function triggerUpload() { $('file-input').click(); }
async function handleUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');
  const type = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document';
  const ext = file.name.split('.').pop();
  const path = `${State.user.id}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('media').upload(path, file);
  if (error) { alert(error.message); return; }
  const { data } = sb.storage.from('media').getPublicUrl(path);
  await sendMessage(State.activeChat, file.name, { messageType: type, mediaUrl: data.publicUrl });
  e.target.value = '';
}

// ============ Calls ============
let _pc, _ls, _callTimer, _callDur = 0;
function startCall(type, receiverId) {
  State.callState = { receiverId, type, chatId: State.activeChat };
  renderCallModal('calling');
  navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' }).then(stream => {
    _ls = stream;
    _pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    stream.getTracks().forEach(t => _pc.addTrack(t, stream));
    _pc.ontrack = (e) => { const v = $('call-remote-video'); if (v) v.srcObject = e.streams[0]; };
    _pc.createOffer().then(offer => _pc.setLocalDescription(offer)).then(() => {
      const ch = sb.channel(`call-${receiverId}`);
      ch.on('broadcast', { event: 'answer' }, async (p) => {
        if (p.from === receiverId) { await _pc.setRemoteDescription(new RTCSessionDescription(p.answer)); renderCallModal('connected'); _callDur = 0; _callTimer = setInterval(() => { _callDur++; $('call-status') && ($('call-status').textContent = formatDuration(_callDur)); }, 1000); }
      }).on('broadcast', { event: 'decline' }, (p) => { if (p.from === receiverId) { renderCallModal('declined'); setTimeout(endCall, 2000); } });
      ch.send({ type: 'broadcast', event: 'offer', payload: { offer: _pc.localDescription, from: State.user.id } });
    });
  }).catch(() => { renderCallModal('ended'); setTimeout(() => $('call-modal').classList.add('hidden'), 2000); });
}
function endCall() { if (_callTimer) clearInterval(_callTimer); if (_ls) _ls.getTracks().forEach(t => t.stop()); if (_pc) _pc.close(); renderCallModal('ended'); setTimeout(() => $('call-modal').classList.add('hidden'), 1000); }
function toggleMute() { if (_ls) _ls.getAudioTracks().forEach(t => t.enabled = !t.enabled); }
function toggleVideo() { if (_ls) _ls.getVideoTracks().forEach(t => t.enabled = !t.enabled); }
function renderCallModal(status) {
  const modal = $('call-modal');
  modal.innerHTML = '';
  const cs = State.callState;
  if (!cs) return;
  const ou = State.profiles[cs.receiverId];
  if (cs.type === 'video') {
    modal.appendChild(el('video', { class: 'call-remote-video', id: 'call-remote-video', autoplay: true, playsinline: true }));
    modal.appendChild(el('video', { class: 'call-local-video', id: 'call-local-video', autoplay: true, playsinline: true, muted: true }));
    const lv = $('call-local-video'); if (lv && _ls) lv.srcObject = _ls;
  }
  const content = el('div', { class: 'call-content' });
  const avatar = el('div', { class: 'call-avatar', style: `background:${avatarColor(ou?.id)}` }, ou?.avatar_url ? el('img', { src: ou.avatar_url }) : initials(ou?.full_name));
  if (status === 'calling') avatar.appendChild(el('div', { class: 'ping' }));
  content.appendChild(avatar);
  content.appendChild(el('div', { style: 'text-align:center' }, el('div', { class: 'call-name' }, ou?.full_name || 'Unknown'), el('div', { class: 'call-status', id: 'call-status' }, status === 'calling' ? 'Calling...' : status === 'connected' ? '00:00' : status === 'declined' ? 'Call declined' : 'Call ended')));
  const controls = el('div', { class: 'call-controls' });
  if (status === 'connected' && cs.type === 'video') controls.appendChild(el('button', { class: 'call-btn-video', onclick: toggleVideo }, el('i', { class: 'bx bx-video' })));
  controls.appendChild(el('button', { class: 'call-btn-mute', onclick: toggleMute }, el('i', { class: 'bx bx-microphone' })));
  controls.appendChild(el('button', { class: 'call-btn-end', onclick: endCall }, el('i', { class: 'bx bx-phone-off' })));
  content.appendChild(controls);
  modal.appendChild(content);
  modal.classList.remove('hidden');
}

// ============ Realtime ============
function setupRealtime() {
  State.realtimeChannels.forEach(c => c.unsubscribe());
  State.realtimeChannels = [];
  const pc = sb.channel('profiles').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadProfiles()).subscribe();
  const mc = sb.channel('members').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_members' }, (p) => { if (p.new.user_id === State.user.id) loadChats(); }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_members' }, () => loadChats()).subscribe();
  const msgCh = sb.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p) => {
    loadChats();
    if (State.activeChat === p.new.chat_id) { await loadMessages(p.new.chat_id); markRead(p.new.chat_id); if (p.new.sender_id !== State.user.id) playSound(); }
    else if (p.new.sender_id !== State.user.id) { playSound(); if (!document.title.startsWith('(')) document.title = '(1) NUVORA'; }
  }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => { if (State.activeChat) loadMessages(State.activeChat); loadChats(); }).on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => { if (State.activeChat) loadMessages(State.activeChat); loadChats(); }).subscribe();
  const rc = sb.channel('reactions').on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => { if (State.activeChat) loadMessages(State.activeChat); }).subscribe();
  State.realtimeChannels = [pc, mc, msgCh, rc];
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') document.title = 'NUVORA'; });
}

// ============ Init ============
window.addEventListener('DOMContentLoaded', () => {
  $('auth-password').addEventListener('input', onPwInput);
  setTimeout(() => { initAuth(); }, 300);
});

// Expose for inline handlers
const App = {
  switchAuthTab, handleAuth, navigate, filterChats: renderSidebar,
  openNewChat, closeNewChat, toggleEmoji, triggerUpload, handleUpload,
  handleSend, onInputChange, onInputKey, searchMessages, closeSearch,
};
