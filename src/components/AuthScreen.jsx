import { useState } from "react";
import { useStore } from "../lib/store";

export default function AuthScreen() {
  const { signIn, signUp } = useStore();
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn({ email, password, pin });
      } else {
        if (password.length < 6) throw new Error("Password must be at least 6 characters");
        if (!fullName.trim()) throw new Error("Full name is required");
        if (!username.trim()) throw new Error("Username is required");
        await signUp({ email, password, fullName, username, pin: pin || null });
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = () => {
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) s++;
    return s;
  };
  const ps = passwordStrength();
  const psColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"];
  const psLabels = ["Weak", "Fair", "Good", "Strong"];

  return (
    <div className="flex h-full items-center justify-center bg-wa-dark p-4">
      <div className="w-full max-w-md scale-in">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <svg viewBox="0 0 48 48" width="64" height="64">
              <circle cx="24" cy="24" r="22" fill="#25D366" />
              <path
                d="M24 12c-6.6 0-12 5.4-12 12 0 2.1.5 4 1.5 5.7L12 36l6.5-1.5c1.7.9 3.6 1.5 5.5 1.5 6.6 0 12-5.4 12-12s-5.4-12-12-12zm0 22c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.8.9.9-3.7-.2-.4c-1-1.5-1.5-3.3-1.5-5.2 0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10z"
                fill="white"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">WhatsApp Clone</h1>
          <p className="mt-1 text-sm text-wa-subtext">Secure, encrypted messaging</p>
        </div>

        <div className="rounded-2xl bg-wa-darkpanel p-6 shadow-xl border border-wa-darkborder">
          <div className="mb-6 flex rounded-lg bg-wa-darkinput p-1">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                mode === "login" ? "bg-wa-green text-white" : "text-wa-subtext"
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                mode === "signup" ? "bg-wa-green text-white" : "text-wa-subtext"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <Input icon="user" placeholder="Full Name" value={fullName} onChange={setFullName} />
                <Input icon="at" placeholder="Username" value={username} onChange={(v) => setUsername(v.toLowerCase().replace(/\s/g, ""))} />
              </>
            )}
            <Input icon="envelope" type="email" placeholder="Email" value={email} onChange={setEmail} />
            <Input icon="lock" type="password" placeholder="Password" value={password} onChange={setPassword} />

            {mode === "signup" && password && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-wa-darkinput overflow-hidden">
                  <div className={`h-full transition-all ${psColors[ps - 1] || "bg-red-500"}`} style={{ width: `${(ps / 4) * 100}%` }} />
                </div>
                <span className="text-xs text-wa-subtext">{psLabels[ps - 1] || "Weak"}</span>
              </div>
            )}

            {mode === "signup" && (
              <Input icon="key" type="password" placeholder="PIN (optional, for E2EE key lock)" value={pin} onChange={setPin} />
            )}

            {error && (
              <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-wa-green py-3 font-semibold text-white transition hover:bg-wa-teal disabled:opacity-50"
            >
              {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-wa-subtext">
          Messages are end-to-end encrypted. Only you and your recipients can read them.
        </p>
      </div>
    </div>
  );
}

function Input({ icon, type = "text", placeholder, value, onChange }) {
  return (
    <div className="relative">
      <i className={`fa-solid fa-${icon} absolute left-4 top-1/2 -translate-y-1/2 text-wa-subtext text-sm`}></i>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-xl bg-wa-darkinput border border-wa-darkborder py-3 pl-11 pr-4 text-white placeholder:text-wa-subtext focus:outline-none focus:border-wa-green transition"
      />
    </div>
  );
}
