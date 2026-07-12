import { useEffect } from "react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { playSound } from "../lib/utils";

export default function RealtimeManager() {
  const { user, loadChats, loadMessages, activeChat, loadProfiles, markRead } = useStore();

  useEffect(() => {
    if (!user) return;

    // Profile changes (presence + profile updates)
    const profileCh = supabase
      .channel("profile-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        loadProfiles();
      })
      .subscribe();

    // New chat memberships (when someone starts a chat with me)
    const memberCh = supabase
      .channel("member-inserts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_members" }, (payload) => {
        if (payload.new.user_id === user.id) {
          loadChats();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_members" }, () => {
        loadChats();
      })
      .subscribe();

    // Message changes
    const msgCh = supabase
      .channel("message-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const msg = payload.new;
        // Reload chat list for preview
        loadChats();
        // If this is the active chat, reload messages
        if (activeChat === msg.chat_id) {
          await loadMessages(msg.chat_id);
          markRead(msg.chat_id);
          if (msg.sender_id !== user.id) playSound();
        } else if (msg.sender_id !== user.id) {
          playSound();
          // Update tab title
          const title = document.title;
          if (!title.startsWith("(")) {
            let count = 1;
            document.title = `(${count}) WhatsApp Clone`;
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        if (activeChat) loadMessages(activeChat);
        loadChats();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, () => {
        if (activeChat) loadMessages(activeChat);
        loadChats();
      })
      .subscribe();

    // Reaction changes
    const reactCh = supabase
      .channel("reaction-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, () => {
        if (activeChat) loadMessages(activeChat);
      })
      .subscribe();

    // Message status changes
    const statusCh = supabase
      .channel("status-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "message_status" }, () => {
        if (activeChat) loadMessages(activeChat);
      })
      .subscribe();

    // Incoming call listener
    const callCh = supabase.channel(`call-${user.id}`);
    callCh
      .on("broadcast", { event: "offer" }, async (payload) => {
        // Show incoming call UI
        useStore.getState().setCallState({
          receiverId: payload.from,
          type: "video",
          incoming: true,
          offer: payload.offer,
        });
      })
      .subscribe();

    // Reset tab title when tab is visible
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        document.title = "WhatsApp Clone";
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      profileCh.unsubscribe();
      memberCh.unsubscribe();
      msgCh.unsubscribe();
      reactCh.unsubscribe();
      statusCh.unsubscribe();
      callCh.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, activeChat]);

  return null;
}
