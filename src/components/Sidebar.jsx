import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { formatTime, getMessagePreview, initials, avatarColor } from "../lib/utils";
import NewChatModal from "./NewChatModal";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, chats, profiles, user, setSearchQuery, searchQuery, signOut } = useStore();
  const [tab, setTab] = useState("chats");
  const [showNewChat, setShowNewChat] = useState(false);
  const [localSearch, setLocalSearch] = useState("");

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const filteredChats = chats.filter((c) => {
    if (!localSearch) return true;
    const name = c.type === "group" ? c.name : getOtherUser(c)?.full_name || "";
    return name.toLowerCase().includes(localSearch.toLowerCase());
  });

  function getOtherUser(chat) {
    if (chat.type !== "direct" || !chat.members) return null;
    const otherId = chat.members.find((id) => id !== user?.id);
    return profiles.get(otherId);
  }

  const activeChatId = location.pathname.match(/\/chat\/(.+)/)?.[1];

  return (
    <div className="flex h-full flex-col bg-wa-darkpanel dark:bg-wa-darkpanel border-r border-wa-darkborder">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-wa-darkpanel">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <i className="fa-brands fa-whatsapp text-wa-green text-2xl"></i>
          WhatsApp
        </h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab("status")} className="p-2 text-wa-subtext hover:text-white transition" title="Status">
            <i className="fa-solid fa-circle-dot"></i>
          </button>
          <button onClick={() => setShowNewChat(true)} className="p-2 text-wa-subtext hover:text-white transition" title="New chat">
            <i className="fa-solid fa-pen-to-square"></i>
          </button>
          <button onClick={() => navigate("/settings")} className="p-2 text-wa-subtext hover:text-white transition" title="Settings">
            <i className="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-wa-darkborder">
        <TabButton active={tab === "chats"} onClick={() => setTab("chats")} icon="comments" label="Chats" />
        <TabButton active={tab === "status"} onClick={() => setTab("status")} icon="circle-dot" label="Status" />
        <TabButton active={tab === "people"} onClick={() => navigate("/people")} icon="users" label="People" />
      </div>

      {/* Search */}
      {tab === "chats" && (
        <div className="px-3 py-2">
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-wa-subtext text-sm"></i>
            <input
              type="text"
              placeholder="Search chats"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full rounded-lg bg-wa-darkinput py-2 pl-11 pr-4 text-sm text-white placeholder:text-wa-subtext focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Chat list */}
      {tab === "chats" && (
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="px-4 py-8 text-center text-wa-subtext text-sm">
              No chats yet. Tap the compose icon to start a conversation.
            </div>
          ) : (
            filteredChats.map((chat) => {
              const otherUser = getOtherUser(chat);
              const name = chat.type === "group" ? chat.name : otherUser?.full_name || "Unknown";
              const avatar = chat.type === "group" ? chat.avatar_url : otherUser?.avatar_url;
              const isOnline = otherUser?.is_online;
              const lastMsg = chat.lastMessage;
              const isActive = activeChatId === chat.id;

              return (
                <div
                  key={chat.id}
                  onClick={() => navigate(`/chat/${chat.id}`)}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-wa-darkchat ${
                    isActive ? "bg-wa-darkchat" : ""
                  }`}
                >
                  <div className="relative shrink-0">
                    {avatar ? (
                      <img src={avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full text-white font-semibold text-lg"
                        style={{ background: chat.type === "group" ? "#25D366" : avatarColor(otherUser?.id || chat.id) }}
                      >
                        {chat.type === "group" ? (
                          <i className="fa-solid fa-users"></i>
                        ) : (
                          initials(name)
                        )}
                      </div>
                    )}
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-wa-green border-2 border-wa-darkpanel"></span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white truncate">{name}</span>
                      {lastMsg && (
                        <span className="text-xs text-wa-subtext ml-2 shrink-0">{formatTime(lastMsg.created_at)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-wa-subtext truncate">
                        {lastMsg?.sender_id === user?.id && "You: "}
                        {getMessagePreview({ ...lastMsg, decrypted: lastMsg?.decrypted })}
                      </span>
                      {chat.myMember?.muted && <i className="fa-solid fa-bell-slash text-xs text-wa-subtext ml-2"></i>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Status tab */}
      {tab === "status" && (
        <div className="flex-1 overflow-y-auto p-4">
          <StatusSection />
        </div>
      )}

      {/* Profile bar */}
      <div className="flex items-center gap-3 border-t border-wa-darkborder px-4 py-3 cursor-pointer hover:bg-wa-darkchat transition" onClick={() => navigate("/profile")}>
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-green text-white font-semibold" style={{ background: avatarColor(user?.id) }}>
            {initials(profile?.full_name || "U")}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white text-sm truncate">{profile?.full_name}</div>
          <div className="text-xs text-wa-subtext truncate">@{profile?.username}</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); signOut(); }} className="p-2 text-wa-subtext hover:text-red-400 transition" title="Log out">
          <i className="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition border-b-2 ${
        active ? "border-wa-green text-wa-green" : "border-transparent text-wa-subtext hover:text-white"
      }`}
    >
      <i className={`fa-solid fa-${icon}`}></i>
      {label}
    </button>
  );
}

function StatusSection() {
  const { profile, profiles, user } = useStore();
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    supabase
      .from("statuses")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setStatuses(data || []));
  }, []);

  const myStatuses = statuses.filter((s) => s.user_id === user?.id);
  const otherStatuses = statuses.filter((s) => s.user_id !== user?.id);

  return (
    <div className="space-y-4">
      {/* My Status */}
      <div className="flex items-center gap-3 cursor-pointer hover:bg-wa-darkchat rounded-lg p-2 -mx-2" onClick={() => {}}>
        <div className="relative">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-wa-darkinput text-wa-subtext">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <i className="fa-solid fa-plus"></i>
            )}
          </div>
          {myStatuses.length === 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-wa-green text-white text-xs">
              <i className="fa-solid fa-plus"></i>
            </span>
          )}
        </div>
        <div>
          <div className="font-medium text-white text-sm">My Status</div>
          <div className="text-xs text-wa-subtext">
            {myStatuses.length > 0 ? "Tap to view" : "Tap to add status"}
          </div>
        </div>
      </div>

      {otherStatuses.length > 0 && (
        <div>
          <div className="text-xs text-wa-subtext uppercase tracking-wide mb-2">Recent Updates</div>
          {otherStatuses.map((s) => {
            const p = profiles.get(s.user_id);
            return (
              <div key={s.id} className="flex items-center gap-3 cursor-pointer hover:bg-wa-darkchat rounded-lg p-2 -mx-2">
                <div className="relative">
                  <div className="rounded-full p-0.5" style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}>
                    {p?.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover border-2 border-wa-darkpanel" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full text-white font-semibold border-2 border-wa-darkpanel" style={{ background: avatarColor(p?.id) }}>
                        {initials(p?.full_name)}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-white text-sm">{p?.full_name || "Unknown"}</div>
                  <div className="text-xs text-wa-subtext">{formatTime(s.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
