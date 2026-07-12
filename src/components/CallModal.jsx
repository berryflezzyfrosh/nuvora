import { useState, useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { initials, avatarColor } from "../lib/utils";

export default function CallModal() {
  const { callState, setCallState, user, profiles, settings } = useStore();
  const [status, setStatus] = useState("calling"); // calling, connected, declined, ended
  const [duration, setDuration] = useState(0);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!callState) return;
    setStatus("calling");
    setDuration(0);

    const startCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callState.type === "video",
        });
        localStreamRef.current = stream;
        if (callState.type === "video" && localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (e) => {
          remoteStreamRef.current = e.streams[0];
          if (callState.type === "video" && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = e.streams[0];
          }
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            supabase.channel(`call-${callState.receiverId}`).send({
              type: "broadcast",
              event: "ice",
              payload: { candidate: e.candidate, from: user.id },
            });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const ch = supabase.channel(`call-${callState.receiverId}`);
        ch.on("broadcast", { event: "answer" }, async (payload) => {
          if (payload.from === callState.receiverId) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
            setStatus("connected");
            startTimer();
          }
        }).on("broadcast", { event: "ice" }, async (payload) => {
          if (payload.from === callState.receiverId) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        }).on("broadcast", { event: "decline" }, (payload) => {
          if (payload.from === callState.receiverId) {
            setStatus("declined");
            setTimeout(() => endCall(), 2000);
          }
        });

        ch.send({ type: "broadcast", event: "offer", payload: { offer, from: user.id } });

        // Log call
        await supabase.from("calls").insert({
          caller_id: user.id,
          receiver_id: callState.receiverId,
          type: callState.type,
          status: "ongoing",
        });
      } catch (err) {
        console.error("Call error:", err);
        setStatus("ended");
        setTimeout(() => setCallState(null), 2000);
      }
    };

    startCall();

    return () => {
      cleanup();
    };
  }, [callState]);

  const startTimer = () => {
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  };

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (pcRef.current) pcRef.current.close();
  };

  const endCall = () => {
    cleanup();
    setStatus("ended");
    setTimeout(() => setCallState(null), 1000);
  };

  if (!callState) return null;

  const otherUser = profiles.get(callState.receiverId);
  const fmtDur = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-wa-darkbg fade-in">
      {/* Video elements */}
      {callState.type === "video" && (
        <>
          <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
          <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-20 right-4 h-32 w-24 rounded-lg object-cover border-2 border-wa-darkborder z-10" />
        </>
      )}

      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* Avatar */}
        <div className="relative">
          {otherUser?.avatar_url ? (
            <img src={otherUser.avatar_url} alt="" className="h-32 w-32 rounded-full object-cover" />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-full text-4xl text-white font-bold" style={{ background: avatarColor(otherUser?.id) }}>
              {initials(otherUser?.full_name)}
            </div>
          )}
          {status === "calling" && (
            <div className="absolute inset-0 rounded-full border-4 border-wa-green animate-ping"></div>
          )}
        </div>

        {/* Info */}
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-white">{otherUser?.full_name || "Unknown"}</h2>
          <p className="text-wa-subtext mt-1">
            {status === "calling" && "Calling..."}
            {status === "connected" && fmtDur}
            {status === "declined" && "Call declined"}
            {status === "ended" && "Call ended"}
          </p>
          {callState.type === "video" && status === "connected" && (
            <p className="text-xs text-wa-subtext mt-1">Video call</p>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-4 mt-8">
          {status === "connected" && (
            <button
              onClick={() => {
                const tracks = localStreamRef.current?.getVideoTracks();
                tracks?.forEach((t) => (t.enabled = !t.enabled));
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-wa-darkinput text-white hover:bg-wa-darkborder transition"
            >
              <i className="fa-solid fa-video text-xl"></i>
            </button>
          )}
          <button
            onClick={() => {
              const tracks = localStreamRef.current?.getAudioTracks();
              tracks?.forEach((t) => (t.enabled = !t.enabled));
            }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-wa-darkinput text-white hover:bg-wa-darkborder transition"
          >
            <i className="fa-solid fa-microphone text-xl"></i>
          </button>
          <button
            onClick={endCall}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition"
          >
            <i className="fa-solid fa-phone-slash text-xl"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
