import { useState, useRef, useEffect } from "react";
import { EMOJI_CATEGORIES } from "../lib/emojiData";

export default function EmojiPicker({ onEmojiClick, theme = "dark" }) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState("");
  const scrollRef = useRef(null);
  const categoryRefs = useRef([]);

  // Filter emojis by search
  const filteredCategories = search
    ? EMOJI_CATEGORIES.map((cat) => ({
        ...cat,
        emojis: cat.emojis.filter((e) =>
          e.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((cat) => cat.emojis.length > 0)
    : EMOJI_CATEGORIES;

  // Scroll to category when tab clicked
  const scrollToCategory = (idx) => {
    setActiveCategory(idx);
    const el = categoryRefs.current[idx];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
    }
  };

  // Update active category on scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const scrollTop = scrollRef.current.scrollTop;
    let current = 0;
    categoryRefs.current.forEach((el, i) => {
      if (el && el.offsetTop - 8 <= scrollTop) current = i;
    });
    if (current !== activeCategory) setActiveCategory(current);
  };

  const isDark = theme === "dark";
  const bgPanel = isDark ? "bg-[#111B21]" : "bg-white";
  const bgInput = isDark ? "bg-[#202C33]" : "bg-gray-100";
  const bgHover = isDark ? "hover:bg-[#2A3942]" : "hover:bg-gray-100";
  const textColor = isDark ? "text-white" : "text-gray-800";
  const subText = isDark ? "text-[#667781]" : "text-gray-400";
  const borderColor = isDark ? "border-[#2A3942]" : "border-gray-200";

  return (
    <div className={`rounded-2xl ${bgPanel} shadow-2xl border ${borderColor} overflow-hidden flex flex-col`} style={{ width: 340, height: 400 }}>
      {/* Search bar */}
      <div className={`p-2 border-b ${borderColor}`}>
        <div className="relative">
          <i className={`bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-sm ${subText}`}></i>
          <input
            type="text"
            placeholder="Search emoji"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full rounded-lg ${bgInput} ${textColor} pl-9 pr-3 py-2 text-sm placeholder:text-[#667781] focus:outline-none`}
          />
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className={`flex items-center gap-1 px-2 py-1.5 border-b ${borderColor} overflow-x-auto scrollbar-hide`}>
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={i}
              onClick={() => scrollToCategory(i)}
              className={`flex-shrink-0 p-1.5 rounded-lg transition ${
                activeCategory === i
                  ? "bg-wa-green/20 text-wa-green"
                  : `${subText} ${bgHover}`
              }`}
              title={cat.name}
            >
              <i className={`bx ${cat.icon} text-lg`}></i>
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2"
      >
        {filteredCategories.length === 0 ? (
          <div className={`flex items-center justify-center h-full ${subText} text-sm`}>
            No emojis found
          </div>
        ) : (
          filteredCategories.map((cat, catIdx) => (
            <div
              key={catIdx}
              ref={(el) => {
                if (!search) categoryRefs.current[catIdx] = el;
              }}
              className="mb-3"
            >
              {!search && (
                <div className={`text-xs font-medium ${subText} px-1 pb-1.5 sticky top-0 ${bgPanel}`}>
                  {cat.name}
                </div>
              )}
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((emoji, i) => (
                  <button
                    key={i}
                    onClick={() => onEmojiClick(emoji)}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg text-xl transition ${bgHover} hover:scale-125 active:scale-95`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
