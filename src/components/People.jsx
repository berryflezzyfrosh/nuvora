import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { initials, avatarColor, formatLastSeen } from "../lib/utils";

export default function People() {
  const navigate = useNavigate();
  const { profiles, startDirectChat, blockedIds, toggleBlock, user } = useStore();
  const [search, setSearch] = useState("");

  const filtered = [...profiles.values()]
    .filter((p) =>
      !search ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.username.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0) || a.full_name.localeCompare(b.full_name));

  const handleMessage = async (userId) => {
    const chatId = await startDirectChat(userId);
    navigate(`/chat/${chatId}`);
  };

  return (
    <div className="flex h-full flex-col bg-wa-darkpanel">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-wa-darkborder">
        <button onClick={() => navigate("/")} className="md:hidden p-2 text-wa-subtext hover:text-white">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <i className="fa-solid fa-globe text-wa-green"></i>
          People
        </h2>
        <div className="relative ml-auto">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-wa-subtext text-sm"></i>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg bg-wa-darkinput py-2 pl-9 pr-3 text-sm text-white placeholder:text-wa-subtext focus:outline-none w-48 sm:w-64"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl">
          {filtered.map((p) => {
            const isBlocked = blockedIds.has(p.id);
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-wa-darkchat p-3 hover:bg-wa-darkborder transition">
                <div className="relative shrink-0">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full text-white font-semibold" style={{ background: avatarColor(p.id) }}>
                      {initials(p.full_name)}
                    </div>
                  )}
                  <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-wa-darkchat ${p.is_online ? "bg-wa-green" : "bg-gray-500"}`}></span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm truncate">{p.full_name}</div>
                  <div className="text-xs text-wa-subtext truncate">@{p.username}</div>
                  <div className="text-xs text-wa-subtext/70">{p.is_online ? "Online" : formatLastSeen(p.last_seen)}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => handleMessage(p.id)} className="rounded-lg bg-wa-green px-3 py-1 text-xs font-medium text-white hover:bg-wa-teal transition">
                    Message
                  </button>
                  <button
                    onClick={() => toggleBlock(p.id)}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition ${isBlocked ? "bg-red-500/20 text-red-400" : "bg-wa-darkinput text-wa-subtext hover:text-white"}`}
                  >
                    {isBlocked ? "Unblock" : "Block"}
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-wa-subtext">
              No people found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
