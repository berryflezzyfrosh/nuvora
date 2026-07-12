import { useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useStore } from "../lib/store";
import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";
import People from "./People";
import Profile from "./Profile";
import Settings from "./Settings";
import StatusView from "./StatusView";
import CallModal from "./CallModal";
import RealtimeManager from "./RealtimeManager";

export default function ChatApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loadProfiles, loadChats, loadBlocked, loadStarred, setOnline, setOffline, settings } = useStore();

  useEffect(() => {
    if (!user) return;
    // Initial load
    loadProfiles();
    loadChats();
    loadBlocked();
    loadStarred();

    // Presence
    setOnline();
    const heartbeat = setInterval(setOnline, 25000);
    const onUnload = () => setOffline();
    window.addEventListener("beforeunload", onUnload);

    // Inactivity auto-logout (30 min)
    let inactivityTimer;
    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        useStore.getState().signOut();
        navigate("/");
      }, 30 * 60 * 1000);
    };
    ["mousemove", "keydown", "touchstart"].forEach((ev) =>
      window.addEventListener(ev, resetTimer)
    );
    resetTimer();

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", onUnload);
      clearTimeout(inactivityTimer);
      ["mousemove", "keydown", "touchstart"].forEach((ev) =>
        window.removeEventListener(ev, resetTimer)
      );
    };
  }, [user]);

  // Apply theme
  useEffect(() => {
    if (settings.theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [settings.theme]);

  return (
    <div className="flex h-full overflow-hidden bg-wa-darkbg dark:bg-wa-darkbg">
      <div className="flex w-full max-w-6xl mx-auto overflow-hidden md:my-0">
        {/* Sidebar — hidden on mobile when a chat is active */}
        <div
          className={`${
            location.pathname.startsWith("/chat/") ? "hidden md:flex" : "flex"
          } w-full md:w-[400px] md:min-w-[400px] flex-col`}
        >
          <Sidebar />
        </div>

        {/* Main panel */}
        <div
          className={`${
            location.pathname.startsWith("/chat/") ? "flex" : "hidden md:flex"
          } flex-1 flex-col overflow-hidden`}
        >
          <Routes>
            <Route path="/" element={<EmptyState />} />
            <Route path="/chat/:chatId" element={<ChatWindow />} />
            <Route path="/people" element={<People />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/status" element={<StatusView />} />
          </Routes>
        </div>
      </div>

      <CallModal />
      <RealtimeManager />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center bg-wa-darkpanel dark:bg-wa-darkpanel">
      <div className="text-center px-8">
        <div className="mb-6 text-6xl text-wa-subtext opacity-30">
          <i className="fa-brands fa-whatsapp"></i>
        </div>
        <h2 className="text-xl font-medium text-wa-subtext mb-2">WhatsApp Clone Web</h2>
        <p className="text-sm text-wa-subtext/70 max-w-md">
          Select a chat to start messaging. All messages are end-to-end encrypted.
        </p>
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-wa-subtext/50">
          <i className="fa-solid fa-lock"></i>
          Your messages are secured with end-to-end encryption
        </div>
      </div>
    </div>
  );
}
