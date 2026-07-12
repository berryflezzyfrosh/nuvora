import { useState, useRef } from "react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { formatDuration } from "../lib/utils";

export default function VoiceRecorder({ chatId }) {
  const { sendMessage, user } = useStore();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = (e) => chunks.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const path = `${user.id}/voice/${Date.now()}.webm`;
        const { error } = await supabase.storage.from("media").upload(path, blob);
        if (!error) {
          const { data } = supabase.storage.from("media").getPublicUrl(path);
          await sendMessage(chatId, "Voice message", { messageType: "voice", mediaUrl: data.publicUrl });
        }
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  };

  const stop = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
    }
    setRecording(false);
    clearInterval(timer.current);
  };

  const cancel = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.ondataavailable = null;
      mediaRecorder.current.onstop = () => {};
      mediaRecorder.current.stop();
    }
    setRecording(false);
    clearInterval(timer.current);
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={cancel} className="p-2 text-red-400 hover:text-red-500 transition">
          <i className="fa-solid fa-xmark text-xl"></i>
        </button>
        <span className="text-sm text-wa-subtext">{formatDuration(seconds)}</span>
        <span className="record-pulse h-3 w-3 rounded-full bg-red-500"></span>
        <button onClick={stop} className="p-2 text-wa-green hover:text-wa-teal transition">
          <i className="fa-solid fa-paper-plane text-xl"></i>
        </button>
      </div>
    );
  }

  return (
    <button onClick={start} className="p-2 text-wa-subtext hover:text-white transition">
      <i className="fa-solid fa-microphone text-xl"></i>
    </button>
  );
}
