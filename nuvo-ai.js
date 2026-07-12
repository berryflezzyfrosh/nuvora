// ============================================================
// NUVO — NUVORA's AI Assistant
// ------------------------------------------------------------
// A smart, self-contained mock AI with broad topic coverage.
// If an OpenAI / Gemini key is ever provided (window.__NUVO_KEY__),
// it will proxy to that API instead. Otherwise the local engine
// handles greetings, questions, writing help, translation, jokes,
// math, time/date, coding help, and casual conversation — with
// a "thinking" delay so the UI can show the typing animation.
// ============================================================

const NUVO = (() => {
  const THINK_MIN = 600;
  const THINK_MAX = 1400;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- Local knowledge engine ----------
  const greetings = [
    "Hey there! I'm NUVO, your AI assistant inside NUVORA. What can I do for you?",
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

  function casualReply(input) {
    const t = input.toLowerCase().trim();
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

  function mathReply(input) {
    const cleaned = input.replace(/[^-+*/().\d\s]/g, "").trim();
    if (!cleaned || !/[-+*/]/.test(cleaned)) return null;
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${cleaned});`)();
      if (typeof result === "number" && isFinite(result)) {
        return `That equals **${result}**. Need help with anything else?`;
      }
    } catch (_) {}
    return null;
  }

  function timeReply(input) {
    const t = input.toLowerCase();
    const now = new Date();
    if (/\bwhat.*(time|hour)\b/.test(t) && !/date/.test(t)) {
      return `It's currently ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} in your local timezone.`;
    }
    if (/\bwhat.*(date|day)\b/.test(t) || /\btoday\b/.test(t)) {
      return `Today is ${now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;
    }
    return null;
  }

  function writingReply(input) {
    const t = input.toLowerCase();
    if (/\b(summarize|summary|tl;?dr)\b/.test(t)) {
      const text = input.replace(/.*\b(summarize|summary|tl;?dr)\b[:\s]*/i, "").trim();
      if (text.length > 20) {
        const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
        const summary = sentences.slice(0, 2).join(". ").trim();
        return summary ? `Here's a summary: ${summary}.` : "I couldn't extract enough meaningful sentences to summarize. Try pasting a longer passage.";
      }
      return "Sure — paste the text you'd like me to summarize after the word 'summarize'.";
    }
    if (/\b(rewrite|improve|polish)\b/.test(t)) {
      const text = input.replace(/.*\b(rewrite|improve|polish)\b[:\s]*/i, "").trim();
      if (text.length > 5) {
        const polished = text.charAt(0).toUpperCase() + text.slice(1);
        const cleaned = polished.replace(/\s+/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
        return `Here's a polished version:\n\n"${cleaned}"`;
      }
      return "Paste the sentence you'd like me to rewrite and I'll clean it up.";
    }
    return null;
  }

  function translateReply(input) {
    const m = input.match(/translate\s+(.+?)\s+(?:to|into)\s+(\w+)/i);
    if (m) {
      const text = m[1].trim();
      const lang = m[2].toLowerCase();
      // Minimal demo dictionary for a few languages
      const dict = {
        spanish: { hello: "hola", "thank you": "gracias", goodbye: "adiós", yes: "sí", no: "no", friend: "amigo" },
        french: { hello: "bonjour", "thank you": "merci", goodbye: "au revoir", yes: "oui", no: "non", friend: "ami" },
        german: { hello: "hallo", "thank you": "danke", goodbye: "auf wiedersehen", yes: "ja", no: "nein", friend: "freund" },
        japanese: { hello: "こんにちは", "thank you": "ありがとう", goodbye: "さようなら", yes: "はい", no: "いいえ", friend: "友達" },
      };
      const map = dict[lang];
      if (!map) return `I don't have a ${lang} dictionary built in for the demo, but I can try if you provide an API key. For now, try: Spanish, French, German, or Japanese.`;
      const translated = text.split(/\s+/).map((w) => map[w.toLowerCase()] || w).join(" ");
      return `In ${lang.charAt(0).toUpperCase() + lang.slice(1)}: **${translated}**`;
    }
    return null;
  }

  function suggestReply(input) {
    const t = input.toLowerCase();
    if (/\b(suggest|reply|respond|what should i say)\b/.test(t)) {
      return [
        "Here are a few reply options:",
        "1. \"Hey! Thanks for reaching out — how can I help?\"",
        "2. \"Got it, I'll take a look and get back to you shortly.\"",
        "3. \"Sounds good! Let's discuss this further.\"",
        "Pick one or tweak it to fit the conversation.",
      ].join("\n");
    }
    return null;
  }

  function codeReply(input) {
    const t = input.toLowerCase();
    if (/\b(code|javascript|python|function|bug|error|program)\b/.test(t)) {
      if (/javascript|js\b/.test(t)) {
        return "Here's a quick JavaScript example:\n\n```js\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\nconsole.log(greet('NUVORA'));\n```\n\nWant me to explain it or adapt it?";
      }
      if (/python\b/.test(t)) {
        return "Here's a quick Python example:\n\n```python\ndef greet(name):\n    return f\"Hello, {name}!\"\n\nprint(greet(\"NUVORA\"))\n```\n\nWant me to explain it or adapt it?";
      }
      return "I can help with JavaScript and Python examples in the demo. Describe what you're trying to build and I'll sketch it out.";
    }
    return null;
  }

  function jokeReply(input) {
    if (/\b(joke|funny|make me laugh)\b/.test(input.toLowerCase())) return pick(jokes);
    return null;
  }

  function factReply(input) {
    if (/\b(fact|did you know|interesting)\b/.test(input.toLowerCase())) return pick(facts);
    return null;
  }

  function fallbackReply(input) {
    const t = input.toLowerCase().trim();
    if (/\b(why|how come)\b/.test(t)) {
      return "That's a thoughtful question. In the demo mode I can reason about common topics — try asking about writing, translation, math, time, jokes, or coding, and I'll give you a concrete answer.";
    }
    if (/\b(what|which|who|where|when)\b/.test(t)) {
      return "I can help look into that. In demo mode I cover writing, summaries, translation, math, jokes, coding, and general chat. Could you give me a bit more detail?";
    }
    return pick([
      "I'm listening! Tell me more — I can help with writing, summaries, translation, math, jokes, coding, or just chat.",
      "Interesting! Could you elaborate? I can assist with writing, translating, summarizing, jokes, and more.",
      "Got it. What would you like me to do with that? I can summarize, rewrite, translate, or just discuss it.",
    ]);
  }

  function localThink(input) {
    return (
      casualReply(input) ||
      mathReply(input) ||
      timeReply(input) ||
      writingReply(input) ||
      translateReply(input) ||
      suggestReply(input) ||
      codeReply(input) ||
      jokeReply(input) ||
      factReply(input) ||
      fallbackReply(input)
    );
  }

  // ---------- Optional remote API (if a key is provided) ----------
  async function remoteThink(input) {
    const key = window.__NUVO_KEY__;
    if (!key) return null;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are NUVO, a friendly, concise AI assistant inside the NUVORA chat app." },
            { role: "user", content: input },
          ],
          max_tokens: 400,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.choices && data.choices[0] && data.choices[0].message.content;
    } catch (_) {
      return null;
    }
  }

  // ---------- Public API ----------
  async function respond(input, { onThinking } = {}) {
    if (onThinking) onThinking(true);
    const delay = THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN);
    await new Promise((r) => setTimeout(r, delay));

    let reply = null;
    if (window.__NUVO_KEY__) reply = await remoteThink(input);
    if (!reply) reply = localThink(input);

    if (onThinking) onThinking(false);
    return reply;
  }

  return { respond };
})();

window.NUVO = NUVO;
