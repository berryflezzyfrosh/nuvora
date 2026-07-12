import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { formatTime, formatDate, initials, avatarColor, playSound } from "../lib/utils";
import EmojiPicker from "emoji-picker-react";
import MessageMenu from "./MessageMenu";
import VoiceRecorder from "./VoiceRecorder";
import MediaUploader from "./MediaUploader";

export default function ChatWindow() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const {
    user, profile, chats, profiles, messages, privateKey,
    loadMessages, sendMessage, markRead, toggleReaction, deleteMessage, editMessage,
    toggleStar, starredIds, settings, typingUsers, removeTypingUser,
  } = useStore();

  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEnd = useRef(null);
  const inputRef = useRef(null);
  const typingChannel = useRef(null);

  const chat = chats.find((c) => c.id === chatId);
  const msgList = messages.get(chatId) || [];

  // Load messages on mount
  useEffect(() => {
    if (chatId) {
      loadMessages(chatId);
      markRead(chatId);
      setReplyTo(null);
      setEditTarget(null);
    }
  }, [chatId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgList.length]);

  // Typing indicator broadcast
  useEffect(() => {
    if (!chatId) return;
    const ch = supabase.channel(`typing-${chatId}`);
    ch.on("broadcast", { event: "typing" }, (payload) => {
      if (payload.userId !== user?.id) {
        useStore.getState().setTypingUser(chatId, payload.userId, payload.name);
        setTimeout(() => useStore.getState().removeTypingUser(chatId, payload.userId), 3000);
      }
    }).subscribe();
    typingChannel.current = ch;
    return () => { ch.unsubscribe(); };
  }, [chatId, user?.id]);

  const broadcastTyping = () => {
    typingChannel.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user?.id, name: profile?.full_name },
    });
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (editTarget) {
      await editMessage(editTarget.id, text);
      setEditTarget(null);
    } else {
      await sendMessage(chatId, text, { replyTo: replyTo?.id });
      setReplyTo(null);
    }
    playSound();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleContext = (e, msg) => {
    e.preventDefault();
    setMenuFor(msg);
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const getOtherUser = () => {
    if (!chat || chat.type !== "direct") return null;
    const otherId = chat.members?.find((id) => id !== user?.id);
    return profiles.get(otherId);
  };

  const otherUser = getOtherUser();
  const chatName = chat?.type === "group" ? chat?.name : otherUser?.full_name || "Unknown";
  const chatAvatar = chat?.type === "group" ? chat?.avatar_url : otherUser?.avatar_url;
  const isOnline = otherUser?.is_online;

  // Filter messages by search
  const displayMessages = searchMode && searchQuery
    ? msgList.filter((m) => (m.decrypted || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : msgList;

  let lastDate = "";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 bg-wa-darkpanel px-4 py-2 border-b border-wa-darkborder">
        <button onClick={() => navigate("/")} className="md:hidden p-2 text-wa-subtext hover:text-white">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <div className="relative shrink-0">
          {chatAvatar ? (
            <img src={chatAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full text-white font-semibold" style={{ background: chat?.type === "group" ? "#25D366" : avatarColor(otherUser?.id || chatId) }}>
              {chat?.type === "group" ? <i className="fa-solid fa-users"></i> : initials(chatName)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => chat?.type === "group" ? null : navigate("/profile")}>
          <div className="font-medium text-white truncate">{chatName}</div>
          <div className="text-xs text-wa-subtext">
            {chat?.type === "group" ? `${chat.members?.length || 0} members` : isOnline ? "Online" : "Last seen recently"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => useStore.getState().setCallState({ receiverId: otherUser?.id, type: "voice", chatId })} className="p-2 text-wa-subtext hover:text-white" title="Voice call">
            <i className="fa-solid fa-phone"></i>
          </button>
          <button onClick={() => useStore.getState().setCallState({ receiverId: otherUser?.id, type: "video", chatId })} className="p-2 text-wa-subtext hover:text-white" title="Video call">
            <i className="fa-solid fa-video"></i>
          </button>
          <button onClick={() => setSearchMode(!searchMode)} className="p-2 text-wa-subtext hover:text-white" title="Search">
            <i className="fa-solid fa-magnifying-glass"></i>
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchMode && (
        <div className="flex items-center gap-2 bg-wa-darkinput px-4 py-2 border-b border-wa-darkborder">
          <i className="fa-solid fa-magnifying-glass text-wa-subtext text-sm"></i>
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder:text-wa-subtext"
            autoFocus
          />
          <button onClick={() => { setSearchMode(false); setSearchQuery(""); }} className="p-1 text-wa-subtext hover:text-white">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto ${settings.theme === "dark" ? "chat-bg-dark" : "chat-bg-light"}`}>
        <div className="px-4 py-4 max-w-3xl mx-auto">
          {/* Encryption notice */}
          <div className="mb-4 flex justify-center">
            <div className="rounded-lg bg-yellow-500/10 px-4 py-2 text-center text-xs text-yellow-600 dark:text-yellow-500">
              <i className="fa-solid fa-lock mr-1"></i>
              Messages are end-to-end encrypted. No one outside this chat can read them.
            </div>
          </div>

          {displayMessages.map((msg) => {
            const mine = msg.sender_id === user?.id;
            const sender = profiles.get(msg.sender_id);
            const date = formatDate(msg.created_at);
            const showDate = date !== lastDate;
            lastDate = date;

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-3">
                    <span className="rounded-lg bg-wa-darkpanel text-wa-subtext text-xs px-3 py-1 shadow">{date}</span>
                  </div>
                )}
                <MessageBubble
                  msg={msg}
                  mine={mine}
                  sender={sender}
                  user={user}
                  starredIds={starredIds}
                  onContext={handleContext}
                  onReply={setReplyTo}
                  profiles={profiles}
                  chatType={chat?.type}
                />
              </div>
            );
          })}

          {/* Typing indicator */}
          {typingUsers.size > 0 && (
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="flex gap-1">
                <span className="typing-dot h-2 w-2 rounded-full bg-wa-subtext"></span>
                <span className="typing-dot h-2 w-2 rounded-full bg-wa-subtext"></span>
                <span className="typing-dot h-2 w-2 rounded-full bg-wa-subtext"></span>
              </div>
              <span className="text-xs text-wa-subtext">typing...</span>
            </div>
          )}

          <div ref={messagesEnd} />
        </div>
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-3 bg-wa-darkinput px-4 py-2 border-t border-wa-darkborder">
          <i className="fa-solid fa-reply text-wa-green"></i>
          <div className="flex-1 border-l-2 border-wa-green pl-2">
            <div className="text-xs font-medium text-wa-green">
              {replyTo.sender_id === user?.id ? "You" : profiles.get(replyTo.sender_id)?.full_name || "Unknown"}
            </div>
            <div className="text-xs text-wa-subtext truncate">{replyTo.decrypted || "[Media]"}</div>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 text-wa-subtext hover:text-white">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Edit indicator */}
      {editTarget && (
        <div className="flex items-center gap-3 bg-wa-darkinput px-4 py-2 border-t border-wa-darkborder">
          <i className="fa-solid fa-pen text-wa-green"></i>
          <div className="flex-1">
            <div className="text-xs font-medium text-wa-green">Editing message</div>
            <div className="text-xs text-wa-subtext truncate">{editTarget.decrypted}</div>
          </div>
          <button onClick={() => { setEditTarget(null); setInput(""); }} className="p-1 text-wa-subtext hover:text-white">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="absolute bottom-16 left-4 z-50 scale-in">
          <EmojiPicker
            onEmojiClick={(emoji) => setInput(input + emoji.emoji)}
            theme={settings.theme === "dark" ? "dark" : "light"}
            width={320}
            height={350}
          />
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 bg-wa-darkinput px-3 py-2">
        <button onClick={() => setShowEmoji(!showEmoji)} className="p-2 text-wa-subtext hover:text-white transition">
          <i className="fa-regular fa-face-smile text-xl"></i>
        </button>
        <MediaUploader chatId={chatId} />
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); broadcastTyping(); }}
          onKeyDown={handleKeyDown}
          placeholder={editTarget ? "Edit message..." : "Type a message"}
          rows={1}
          className="flex-1 resize-none bg-transparent text-white placeholder:text-wa-subtext focus:outline-none py-2 max-h-32"
          style={{ minHeight: "40px" }}
        />
        <VoiceRecorder chatId={chatId} />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wa-green text-white transition hover:bg-wa-teal disabled:opacity-50"
        >
          <i className={`fa-solid ${input.trim() ? "fa-paper-plane" : "fa-microphone"}`}></i>
        </button>
      </div>

      {/* Context menu */}
      {menuFor && (
        <MessageMenu
          msg={menuFor}
          x={menuPos.x}
          y={menuPos.y}
          isMine={menuFor.sender_id === user?.id}
          starred={starredIds.has(menuFor.id)}
          onClose={() => setMenuFor(null)}
          onReply={() => { setReplyTo(menuFor); setMenuFor(null); }}
          onEdit={() => { setEditTarget(menuFor); setInput(menuFor.decrypted || ""); setMenuFor(null); }}
          onDelete={(forAll) => { deleteMessage(menuFor.id, forAll); setMenuFor(null); }}
          onStar={() => { toggleStar(menuFor.id); setMenuFor(null); }}
          onReact={(emoji) => { toggleReaction(menuFor.id, emoji); setMenuFor(null); }}
          onCopy={() => { navigator.clipboard.writeText(menuFor.decrypted || ""); setMenuFor(null); }}
        />
      )}
    </div>
  );
}

function MessageBubble({ msg, mine, sender, user, starredIds, onContext, onReply, profiles, chatType }) {
  const [showReactions, setShowReactions] = useState(false);

  if (msg.is_deleted) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-1`}>
        <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm italic text-wa-subtext ${mine ? "bg-wa-darkbubbleout" : "bg-wa-darkbubblein"}`}>
          🚫 This message was deleted
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (msg.message_type === "image" && msg.media_url) {
      return <img src={msg.media_url} alt="" className="rounded-lg max-w-[280px] max-h-[300px] object-cover" />;
    }
    if (msg.message_type === "video" && msg.media_url) {
      return <video src={msg.media_url} controls className="rounded-lg max-w-[280px] max-h-[300px]" />;
    }
    if (msg.message_type === "voice" && msg.media_url) {
      return <audio src={msg.media_url} controls className="w-[240px]" />;
    }
    if (msg.message_type === "audio" && msg.media_url) {
      return <audio src={msg.media_url} controls className="w-[240px]" />;
    }
    if (msg.message_type === "document" && msg.media_url) {
      return (
        <a href={msg.media_url} download className="flex items-center gap-2 text-wa-green hover:underline">
          <i className="fa-solid fa-file"></i> Download document
        </a>
      );
    }
    return <span className="whitespace-pre-wrap break-words">{msg.decrypted || "[Encrypted]"}</span>;
  };

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-1 animate-slide-in`}>
      <div className={`group relative max-w-[75%]`}>
        <div
          onContextMenu={(e) => onContext(e, msg)}
          onTouchStart={(e) => {
            const touchTimer = setTimeout(() => onContext({ preventDefault: () => {}, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }, msg), 500);
            e.target.addEventListener("touchend", () => clearTimeout(touchTimer), { once: true });
          }}
          className={`relative rounded-lg px-3 py-2 text-sm ${mine ? "bg-wa-darkbubbleout text-white" : "bg-wa-darkbubblein text-white"}`}
        >
          {/* Sender name for groups */}
          {!mine && chatType === "group" && sender && (
            <div className="text-xs font-medium mb-0.5" style={{ color: avatarColor(sender.id) }}>
              {sender.full_name}
            </div>
          )}

          {/* Reply quote */}
          {msg.reply_to_id && (
            <div className="border-l-2 border-wa-green pl-2 mb-1 text-xs opacity-70">
              <div className="font-medium text-wa-green">
                {msg.reply_sender_name || "User"}
              </div>
              <div className="truncate">{msg.reply_content || "[Message]"}</div>
            </div>
          )}

          {/* Forwarded indicator */}
          {msg.forwarded_from && (
            <div className="text-xs text-wa-subtext italic mb-1">
              <i className="fa-solid fa-share mr-1"></i>Forwarded
            </div>
          )}

          {renderContent()}

          {/* Timestamp + ticks */}
          <div className="flex items-center justify-end gap-1 mt-0.5">
            {msg.is_edited && <span className="text-[10px] text-wa-subtext italic">edited</span>}
            <span className="text-[10px] text-wa-subtext">{formatTime(msg.created_at)}</span>
            {mine && <TickIcon status={msg.status || "sent"} />}
          </div>
        </div>

        {/* Reactions */}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className={`flex gap-1 mt-0.5 ${mine ? "justify-end" : "justify-start"}`}>
            {Object.entries(
              msg.reactions.reduce((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                return acc;
              }, {})
            ).map(([emoji, count]) => (
              <span key={emoji} className="flex items-center gap-0.5 rounded-full bg-wa-darkinput px-2 py-0.5 text-xs">
                {emoji} {count > 1 && count}
              </span>
            ))}
          </div>
        )}

        {/* Star indicator */}
        {starredIds.has(msg.id) && (
          <div className={`absolute -top-2 ${mine ? "-left-2" : "-right-2"} text-yellow-500 text-xs`}>
            <i className="fa-solid fa-star"></i>
          </div>
        )}
      </div>
    </div>
  );
}

function TickIcon({ status }) {
  if (status === "sent") return <i className="fa-solid fa-check text-[10px] text-wa-subtext"></i>;
  if (status === "delivered") return <i className="fa-solid fa-check-double text-[10px] text-wa-subtext"></i>;
  if (status === "read") return <i className="fa-solid fa-check-double text-[10px] text-sky-400"></i>;
  return null;
}
