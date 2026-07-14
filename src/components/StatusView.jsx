import { useState, useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { initials, avatarColor, formatTime } from "../lib/utils";

export default function StatusView() {
  const { user, profile, profiles } = useStore();
  const [statuses, setStatuses] = useState([]);
  const [posting, setPosting] = useState(false);
  const [textStatus, setTextStatus] = useState("");
  const [privacy, setPrivacy] = useState("all");
  const [viewing, setViewing] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    loadStatuses();
  }, []);

  const loadStatuses = async () => {
    const { data } = await supabase
      .from("statuses")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    setStatuses(data || []);
  };

  const postText = async () => {
    if (!textStatus.trim()) return;
    await supabase.from("statuses").insert({
      user_id: user.id,
      encrypted_content: btoa(unescape(encodeURIComponent(textStatus))),
      iv: "status",
      status_type: "text",
      privacy,
    });
    setTextStatus("");
    setPosting(false);
    loadStatuses();
  };

  const postImage = async (file) => {
    const path = `${user.id}/status/${Date.now()}.${file.name.split(".").pop()}`;
    await supabase.storage.from("media").upload(path, file);
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    await supabase.from("statuses").insert({
      user_id: user.id,
      encrypted_content: "",
      iv: "status",
      media_url: data.publicUrl,
      status_type: "image",
      privacy,
    });
    loadStatuses();
  };

  const myStatuses = statuses.filter((s) => s.user_id === user?.id);
  const otherStatuses = statuses.filter((s) => s.user_id !== user?.id);

  return (
    <div className="flex h-full flex-col bg-wa-darkpanel overflow-y-auto">
      <div className="px-4 py-3 border-b border-wa-darkborder">
        <h2 className="text-lg font-semibold text-white">Status</h2>
      </div>

      <div className="p-4 space-y-6">
        {/* My Status */}
        <div>
          <div className="flex items-center gap-3 cursor-pointer hover:bg-wa-darkchat rounded-lg p-2 -mx-2" onClick={() => myStatuses.length > 0 ? setViewing(myStatuses[0]) : setPosting(true)}>
            <div className="relative">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full text-white font-semibold" style={{ background: avatarColor(user?.id) }}>
                  {initials(profile?.full_name)}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-wa-green text-white text-xs border-2 border-wa-darkpanel">
                <i className="bx bx-plus"></i>
              </span>
            </div>
            <div>
              <div className="font-medium text-white">My Status</div>
              <div className="text-xs text-wa-subtext">{myStatuses.length > 0 ? `${myStatuses.length} update${myStatuses.length > 1 ? "s" : ""}` : "Tap to add status"}</div>
            </div>
          </div>
        </div>

        {/* Post status */}
        {posting && (
          <div className="rounded-xl bg-wa-darkchat p-4 space-y-3 scale-in">
            <textarea
              placeholder="Type a status..."
              value={textStatus}
              onChange={(e) => setTextStatus(e.target.value)}
              className="w-full rounded-lg bg-wa-darkinput px-3 py-2 text-white placeholder:text-wa-subtext focus:outline-none resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-wa-subtext">Privacy:</label>
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="rounded-lg bg-wa-darkinput px-2 py-1 text-sm text-white focus:outline-none">
                <option value="all">All Contacts</option>
                <option value="selected">Selected</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()} className="rounded-lg bg-wa-darkinput px-3 py-1.5 text-sm text-white hover:bg-wa-darkborder transition">
                <i className="bx bx-image mr-1"></i> Photo
              </button>
              <button onClick={postText} className="rounded-lg bg-wa-green px-3 py-1.5 text-sm text-white hover:bg-wa-teal transition">
                Post Text
              </button>
              <button onClick={() => setPosting(false)} className="rounded-lg bg-wa-darkinput px-3 py-1.5 text-sm text-wa-subtext hover:text-white transition ml-auto">
                Cancel
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { postImage(e.target.files[0]); setPosting(false); }} />
          </div>
        )}

        {/* Other statuses */}
        {otherStatuses.length > 0 && (
          <div>
            <h3 className="text-xs text-wa-subtext uppercase tracking-wide mb-2">Recent Updates</h3>
            <div className="space-y-2">
              {otherStatuses.map((s) => {
                const p = profiles.get(s.user_id);
                return (
                  <div key={s.id} onClick={() => setViewing(s)} className="flex items-center gap-3 cursor-pointer hover:bg-wa-darkchat rounded-lg p-2 -mx-2 transition">
                    <div className="rounded-full p-0.5" style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}>
                      {p?.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover border-2 border-wa-darkpanel" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full text-white font-semibold border-2 border-wa-darkpanel" style={{ background: avatarColor(p?.id) }}>
                          {initials(p?.full_name)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-white text-sm">{p?.full_name || "Unknown"}</div>
                      <div className="text-xs text-wa-subtext">{formatTime(s.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Status viewer */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 fade-in" onClick={() => setViewing(null)}>
          <div className="relative max-w-lg w-full mx-4">
            <div className="rounded-2xl overflow-hidden">
              {viewing.status_type === "image" && viewing.media_url ? (
                <img src={viewing.media_url} alt="" className="w-full max-h-[80vh] object-contain" />
              ) : (
                <div className="flex items-center justify-center min-h-[300px] bg-wa-darkpanel p-8">
                  <p className="text-white text-xl text-center">{viewing.encrypted_content ? decodeURIComponent(escape(atob(viewing.encrypted_content))) : "[Status]"}</p>
                </div>
              )}
            </div>
            <button onClick={() => setViewing(null)} className="absolute top-2 right-2 p-2 text-white hover:text-wa-subtext">
              <i className="bx bx-x text-2xl"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
