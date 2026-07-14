import { useState, useRef } from "react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";

export default function MediaUploader({ chatId }) {
  const { sendMessage, user } = useStore();
  const [showMenu, setShowMenu] = useState(false);
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const docRef = useRef(null);

  const upload = async (file, messageType) => {
    if (!file) return;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file);
    if (error) {
      console.error(error);
      return;
    }
    const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
    await sendMessage(chatId, file.name, { messageType, mediaUrl: urlData.publicUrl });
  };

  return (
    <div className="relative">
      <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-wa-subtext hover:text-white transition">
        <i className="bx bx-paperclip text-xl"></i>
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute bottom-12 left-0 z-50 rounded-xl bg-wa-darkpanel border border-wa-darkborder py-1 shadow-xl scale-in">
            <MenuItem icon="bx-image" label="Photos" color="text-purple-400" onClick={() => { imageRef.current?.click(); setShowMenu(false); }} />
            <MenuItem icon="bx-video" label="Videos" color="text-pink-400" onClick={() => { fileRef.current?.click(); setShowMenu(false); }} />
            <MenuItem icon="bx-file" label="Documents" color="text-blue-400" onClick={() => { docRef.current?.click(); setShowMenu(false); }} />
          </div>
        </>
      )}

      <input ref={imageRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files[0], "image")} />
      <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => upload(e.target.files[0], "video")} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.txt,.zip" hidden onChange={(e) => upload(e.target.files[0], "document")} />
    </div>
  );
}

function MenuItem({ icon, label, color, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-wa-darkchat transition">
      <i className={`${icon} ${color} text-lg w-4`}></i>
      {label}
    </button>
  );
}
