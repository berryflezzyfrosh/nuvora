import { useEffect, useRef } from "react";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export default function MessageMenu({ msg, x, y, isMine, starred, onClose, onReply, onEdit, onDelete, onStar, onReact, onCopy }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Adjust position to stay on screen
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 300);

  return (
    <div
      ref={ref}
      className="fixed z-50 scale-in"
      style={{ left, top }}
    >
      {/* Reactions */}
      <div className="flex gap-1 rounded-xl bg-wa-darkpanel border border-wa-darkborder p-2 mb-1 shadow-xl">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onReact(emoji)}
            className="text-xl hover:scale-125 transition p-1"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Menu items */}
      <div className="rounded-xl bg-wa-darkpanel border border-wa-darkborder py-1 shadow-xl overflow-hidden">
        <MenuItem icon="reply" label="Reply" onClick={onReply} />
        {msg.message_type === "text" && isMine && !msg.is_deleted && (
          <MenuItem icon="pen" label="Edit" onClick={onEdit} />
        )}
        <MenuItem icon="copy" label="Copy" onClick={onCopy} />
        <MenuItem icon="share" label="Forward" onClick={() => { navigator.clipboard.writeText(msg.decrypted || ""); onClose(); }} />
        <MenuItem icon="star" label={starred ? "Unstar" : "Star"} onClick={onStar} />
        <MenuItem icon="trash" label="Delete for me" onClick={() => onDelete(false)} danger />
        {isMine && !msg.is_deleted && (
          <MenuItem icon="trash-can" label="Delete for everyone" onClick={() => onDelete(true)} danger />
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-wa-darkchat transition ${
        danger ? "text-red-400" : "text-white"
      }`}
    >
      <i className={`fa-solid fa-${icon} w-4`}></i>
      {label}
    </button>
  );
}
