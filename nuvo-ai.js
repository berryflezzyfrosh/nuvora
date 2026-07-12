// ============================================================
// NUVO — NUVORA's AI Assistant
// Smart local engine with broad topic coverage.
// If window.__NUVO_KEY__ is set, proxies to OpenAI instead.
// ============================================================

const NUVO = (() => {
  const THINK_MIN = 600, THINK_MAX = 1400;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  const greetings = [
    "Hey there! I'm NUVO, your AI assistant in NUVORA. What can I do for you?",
    "Hello! Great to see you. Ask me anything — I'm here to help.",
    "Hi! I'm NUVO. I can help with writing, summaries, translations, jokes, questions, and more.",
  ];
  const jokes = [
    "Why do programmers prefer dark mode? Because light attracts bugs!",
    "Why did the developer go broke? Because he used up all his cache.",
    "How many programmers does it take to change a light bulb? None — that's a hardware problem.",
    "Why do Java developers wear glasses? Because they don't C#.",
    "I'd tell you a UDP joke, but you might not get it.",
    "Why was the JavaScript developer sad? Because he didn't 'null' how to express his feelings.",
    "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
  ];
  const facts = [
    "Did you know honey never spoils? Archaeologists have found 3,000-year-old honey in tombs that's still edible.",
    "Octopuses have three hearts and blue blood.",
    "A day on Venus is longer than a year on Venus.",
    "The first computer programmer was Ada Lovelace, back in the 1840s.",
    "Bananas are berries, but strawberries aren't.",
  ];

  function casualReply(i) {
    const t = i.toLowerCase().trim();
    if (/\b(hi|hello|hey|yo|sup|howdy)\b/.test(t)) return pick(greetings);
    if (/\bhow are you\b/.test(t)) return "I'm running at full capacity, thanks for asking! How can I help you today?";
    if (/\b(what|who) (are|r) you\b/.test(t)) return "I'm NUVO — the AI assistant built into NUVORA. I can chat, answer questions, help with writing, translate, summarize, tell jokes, and more.";
    if (/\b(thanks|thank you|thx|ty)\b/.test(t)) return pick(["You're welcome!", "Anytime!", "Happy to help!"]);
    if (/\b(bye|goodbye|see you|cya)\b/.test(t)) return "Goodbye! Come back anytime — I'll be right here in your chat list.";
    if (/\b(help|what can you do)\b/.test(t)) return "I can: answer questions, help with writing, summarize text, translate between languages, tell jokes, do math, suggest chat replies, and have casual conversations. Just ask!";
    if (/\b(yes|yeah|yep|ok|okay|sure)\b/.test(t)) return "Great — what would you like to do next?";
    if (/\b(no|nope|nah)\b/.test(t)) return "No problem. I'm here whenever you need me.";
    return null;
  }
  function mathReply(i) {
    const c = i.replace(/[^-+*/().\d\s]/g, "").trim();
    if (!c || !/[-+*/]/.test(c)) return null;
    try { const r = Function(`"use strict";return (${c})`)(); if (typeof r === "number" && isFinite(r)) return `That equals **${r}**. Need help with anything else?`; } catch {}
    return null;
  }
  function timeReply(i) {
    const t = i.toLowerCase(), n = new Date();
    if (/\bwhat.*(time|hour)\b/.test(t) && !/date/.test(t)) return `It's currently ${n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} in your local timezone.`;
    if (/\bwhat.*(date|day)\b/.test(t) || /\btoday\b/.test(t)) return `Today is ${n.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;
    return null;
  }
  function writingReply(i) {
    const t = i.toLowerCase();
    if (/\b(summarize|summary|tl;?dr)\b/.test(t)) {
      const text = i.replace(/.*\b(summarize|summary|tl;?dr)\b[:\s]*/i, "").trim();
      if (text.length > 20) { const s = text.split(/[.!?]+/).filter(s => s.trim().length > 5).slice(0, 2).join(". ").trim(); return s ? `Here's a summary: ${s}.` : "I couldn't extract enough to summarize. Try pasting a longer passage."; }
      return "Sure — paste the text you'd like me to summarize after the word 'summarize'.";
    }
    if (/\b(rewrite|improve|polish)\b/.test(t)) {
      const text = i.replace(/.*\b(rewrite|improve|polish)\b[:\s]*/i, "").trim();
      if (text.length > 5) { const p = text.charAt(0).toUpperCase() + text.slice(1); return `Here's a polished version:\n\n"${p.replace(/\s+/g, " ").replace(/\s+([.,!?])/g, "$1").trim()}"`; }
      return "Paste the sentence you'd like me to rewrite and I'll clean it up.";
    }
    return null;
  }
  function translateReply(i) {
    const m = i.match(/translate\s+(.+?)\s+(?:to|into)\s+(\w+)/i);
    if (m) {
      const text = m[1].trim(), lang = m[2].toLowerCase();
      const dict = {
        spanish: { hello: "hola", "thank you": "gracias", goodbye: "adiós", yes: "sí", no: "no", friend: "amigo" },
        french: { hello: "bonjour", "thank you": "merci", goodbye: "au revoir", yes: "oui", no: "non", friend: "ami" },
        german: { hello: "hallo", "thank you": "danke", goodbye: "auf wiedersehen", yes: "ja", no: "nein", friend: "freund" },
        japanese: { hello: "こんにちは", "thank you": "ありがとう", goodbye: "さようなら", yes: "はい", no: "いいえ", friend: "友達" },
      };
      const map = dict[lang];
      if (!map) return `I don't have a ${lang} dictionary built in for the demo. Try: Spanish, French, German, or Japanese.`;
      return `In ${lang.charAt(0).toUpperCase() + lang.slice(1)}: **${text.split(/\s+/).map(w => map[w.toLowerCase()] || w).join(" ")}**`;
    }
    return null;
  }
  function suggestReply(i) {
    if (/\b(suggest|reply|respond|what should i say)\b/.test(i.toLowerCase())) {
      return ['Here are a few reply options:', '1. "Hey! Thanks for reaching out — how can I help?"', '2. "Got it, I\'ll take a look and get back to you shortly."', '3. "Sounds good! Let\'s discuss this further."', 'Pick one or tweak it to fit the conversation.'].join("\n");
    }
    return null;
  }
  function codeReply(i) {
    const t = i.toLowerCase();
    if (/\b(code|javascript|python|function|bug|error|program)\b/.test(t)) {
      if (/javascript|js\b/.test(t)) return "Here's a quick JavaScript example:\n\n```js\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\nconsole.log(greet('NUVORA'));\n```\n\nWant me to explain it or adapt it?";
      if (/python\b/.test(t)) return "Here's a quick Python example:\n\n```python\ndef greet(name):\n    return f\"Hello, {name}!\"\n\nprint(greet(\"NUVORA\"))\n```\n\nWant me to explain it or adapt it?";
      return "I can help with JavaScript and Python examples in the demo. Describe what you're trying to build and I'll sketch it out.";
    }
    return null;
  }
  function jokeReply(i) { if (/\b(joke|funny|make me laugh)\b/.test(i.toLowerCase())) return pick(jokes); return null; }
  function factReply(i) { if (/\b(fact|did you know|interesting)\b/.test(i.toLowerCase())) return pick(facts); return null; }
  function fallbackReply(i) {
    const t = i.toLowerCase().trim();
    if (/\b(why|how come)\b/.test(t)) return "That's a thoughtful question. In demo mode I can reason about common topics — try asking about writing, translation, math, time, jokes, or coding, and I'll give you a concrete answer.";
    if (/\b(what|which|who|where|when)\b/.test(t)) return "I can help look into that. In demo mode I cover writing, summaries, translation, math, jokes, coding, and general chat. Could you give me a bit more detail?";
    return pick(["I'm listening! Tell me more — I can help with writing, summaries, translation, math, jokes, coding, or just chat.", "Interesting! Could you elaborate? I can assist with writing, translating, summarizing, jokes, and more.", "Got it. What would you like me to do with that? I can summarize, rewrite, translate, or just discuss it."]);
  }
  function localThink(i) {
    return casualReply(i) || mathReply(i) || timeReply(i) || writingReply(i) || translateReply(i) || suggestReply(i) || codeReply(i) || jokeReply(i) || factReply(i) || fallbackReply(i);
  }
  async function remoteThink(i) {
    const key = window.__NUVO_KEY__; if (!key) return null;
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "gpt-3.5-turbo", messages: [{ role: "system", content: "You are NUVO, a friendly, concise AI assistant inside the NUVORA chat app." }, { role: "user", content: i }], max_tokens: 400 }) });
      if (!r.ok) return null;
      const d = await r.json(); return d.choices && d.choices[0] && d.choices[0].message.content;
    } catch { return null; }
  }
  async function respond(input, { onThinking } = {}) {
    if (onThinking) onThinking(true);
    await new Promise(r => setTimeout(r, THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN)));
    let reply = null;
    if (window.__NUVO_KEY__) reply = await remoteThink(input);
    if (!reply) reply = localThink(input);
    if (onThinking) onThinking(false);
    return reply;
  }
  return { respond };
})();
window.NUVO = NUVO;
