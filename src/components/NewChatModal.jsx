import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { initials, avatarColor } from "../lib/utils";

export default function NewChatModal({ onClose }) {
  const navigate = useNavigate();
  const { profiles, startDirectChat, createGroup } = useStore();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [groupName, setGroupName] = useState("");
  const [step, setStep] = useState("select");

  const filtered = [...profiles.values()].filter((p) =>
    !search || p.full_name.toLowerCase().includes(search.toLowerCase()) || p.username.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleNext = () => {
    if (selected.size === 1) {
      const id = [...selected][0];
      startDirectChat(id).then((chatId) => {
        onClose();
        navigate(`/chat/${chatId}`);
      });
    } else if (selected.size > 1) {
      setStep("group");
    }
  };

  const handleCreateGroup = async () => {
    const chatId = await createGroup(groupName || "New Group", [...selected]);
    onClose();
    navigate(`/chat/${chatId}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 fade-in" onClick={onClose}>
      <div className="w-full max-w-md mx-4 rounded-2xl bg-wa-darkpanel border border-wa-darkborder shadow-2xl scale-in" onClick={(e) => e.stopPropagation()}>
        {step === "select" ? (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-wa-darkborder">
              <h2 className="text-lg font-semibold text-white">New Chat</h2>
              <button onClick={onClose} className="p-1 text-wa-subtext hover:text-white">
                <i className="bx bx-x text-lg"></i>
              </button>
            </div>
            <div className="px-5 py-3">
              <div className="relative">
                <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-wa-subtext text-sm"></i>
                <input
                  type="text"
                  placeholder="Search people..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg bg-wa-darkinput py-2 pl-10 pr-3 text-sm text-white placeholder:text-wa-subtext focus:outline-none"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-wa-darkchat transition ${selected.has(p.id) ? "bg-wa-darkchat" : ""}`}
                >
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full text-white font-semibold" style={{ background: avatarColor(p.id) }}>
                      {initials(p.full_name)}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-white text-sm">{p.full_name}</div>
                    <div className="text-xs text-wa-subtext">@{p.username}</div>
                  </div>
                  {selected.has(p.id) && <i className="bx bx-check text-wa-green text-lg"></i>}
                </div>
              ))}
            </div>
            {selected.size > 0 && (
              <div className="px-5 py-3 border-t border-wa-darkborder">
                <button
                  onClick={handleNext}
                  className="w-full rounded-xl bg-wa-green py-2.5 font-semibold text-white hover:bg-wa-teal transition"
                >
                  {selected.size === 1 ? "Start Chat" : `Create Group (${selected.size})`}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-wa-darkborder">
              <h2 className="text-lg font-semibold text-white">New Group</h2>
              <button onClick={() => setStep("select")} className="p-1 text-wa-subtext hover:text-white">
                <i className="bx bx-arrow-back text-lg"></i>
              </button>
            </div>
            <div className="px-5 py-4">
              <input
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={50}
                className="w-full rounded-lg bg-wa-darkinput py-3 px-4 text-white placeholder:text-wa-subtext focus:outline-none mb-4"
                autoFocus
              />
              <div className="text-sm text-wa-subtext mb-3">{selected.size} members</div>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim()}
                className="w-full rounded-xl bg-wa-green py-2.5 font-semibold text-white hover:bg-wa-teal transition disabled:opacity-50"
              >
                Create Group
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
