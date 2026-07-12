import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { initials, avatarColor } from "../lib/utils";

export default function Profile() {
  const navigate = useNavigate();
  const { profile, user, updateProfile, chats, profiles, signOut, starredIds } = useStore();
  const [bio, setBio] = useState(profile?.bio || "");
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [editing, setEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url);
  const fileRef = useRef(null);

  const handleAvatar = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      // Upload to storage
      const path = `${user.id}/avatar/${Date.now()}.jpg`;
      await supabase.storage.from("media").upload(path, file);
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      await updateProfile({ avatar_url: data.publicUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    await updateProfile({ bio, full_name: fullName });
    setEditing(false);
  };

  return (
    <div className="flex h-full flex-col bg-wa-darkpanel overflow-y-auto">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-wa-darkborder">
        <button onClick={() => navigate("/")} className="md:hidden p-2 text-wa-subtext hover:text-white">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <h2 className="text-lg font-semibold text-white">Profile</h2>
        <button onClick={() => navigate("/settings")} className="ml-auto p-2 text-wa-subtext hover:text-white">
          <i className="fa-solid fa-gear"></i>
        </button>
      </div>

      <div className="flex-1 p-6 max-w-lg mx-auto w-full">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-28 w-28 rounded-full object-cover" />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full text-4xl text-white font-bold" style={{ background: avatarColor(user?.id) }}>
                {initials(fullName)}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition">
              <i className="fa-solid fa-camera text-white text-2xl"></i>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleAvatar(e.target.files[0])} />
        </div>

        {/* Info */}
        <div className="space-y-4">
          <div>
            <label className="text-xs text-wa-subtext uppercase tracking-wide">Name</label>
            {editing ? (
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full mt-1 rounded-lg bg-wa-darkinput px-4 py-2 text-white focus:outline-none" />
            ) : (
              <div className="mt-1 text-white text-lg font-medium">{fullName}</div>
            )}
          </div>
          <div>
            <label className="text-xs text-wa-subtext uppercase tracking-wide">Username</label>
            <div className="mt-1 text-wa-subtext">@{profile?.username}</div>
          </div>
          <div>
            <label className="text-xs text-wa-subtext uppercase tracking-wide">Email</label>
            <div className="mt-1 text-wa-subtext">{user?.email}</div>
          </div>
          <div>
            <label className="text-xs text-wa-subtext uppercase tracking-wide">Bio</label>
            {editing ? (
              <input value={bio} onChange={(e) => setBio(e.target.value)} className="w-full mt-1 rounded-lg bg-wa-darkinput px-4 py-2 text-white focus:outline-none" placeholder="Add a bio..." />
            ) : (
              <div className="mt-1 text-wa-subtext">{bio || "No bio set"}</div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-around mt-8 py-4 border-t border-wa-darkborder">
          <Stat label="Chats" value={chats.length} />
          <Stat label="Contacts" value={profiles.size} />
          <Stat label="Starred" value={starredIds.size} />
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2">
          {editing ? (
            <button onClick={handleSave} className="w-full rounded-xl bg-wa-green py-3 font-semibold text-white hover:bg-wa-teal transition">
              Save Changes
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="w-full rounded-xl bg-wa-darkinput py-3 font-semibold text-white hover:bg-wa-darkborder transition">
              Edit Profile
            </button>
          )}
          <button onClick={() => signOut()} className="w-full rounded-xl bg-red-500/10 py-3 font-semibold text-red-400 hover:bg-red-500/20 transition">
            <i className="fa-solid fa-right-from-bracket mr-2"></i>
            Log Out
          </button>
        </div>

        {/* Public key */}
        <div className="mt-6 rounded-lg bg-wa-darkinput p-3">
          <div className="text-xs text-wa-subtext uppercase tracking-wide mb-1">E2EE Public Key</div>
          <div className="text-xs text-wa-subtext font-mono break-all">{profile?.public_key ? profile.public_key.slice(0, 40) + "..." : "No key generated"}</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-wa-subtext">{label}</div>
    </div>
  );
}
