import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { useStore } from "./lib/store";
import AuthScreen from "./components/AuthScreen";
import ChatApp from "./components/ChatApp";
import Splash from "./components/Splash";

export default function App() {
  const { user, loading, authReady, initSession, setAuthReady } = useStore();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Apply theme on mount
    const theme = useStore.getState().settings.theme;
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");

    // Check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && session.user) {
        await initSession(session.user);
      }
      setAuthReady(true);
      setTimeout(() => setShowSplash(false), 1200);
    });

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === "SIGNED_IN" && session && session.user) {
          await initSession(session.user);
        } else if (event === "SIGNED_OUT") {
          useStore.setState({
            user: null,
            profile: null,
            chats: [],
            activeChat: null,
            messages: new Map(),
            privateKey: null,
          });
        }
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Apply theme when it changes
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  if (showSplash || !authReady) return <Splash />;

  if (!user) return <AuthScreen />;

  return (
    <HashRouter>
      <Routes>
        <Route path="/*" element={<ChatApp />} />
      </Routes>
    </HashRouter>
  );
}
