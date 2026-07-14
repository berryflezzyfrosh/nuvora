import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";

export default function Settings() {
  const navigate = useNavigate();
  const { settings, updateSettings, signOut } = useStore();

  return (
    <div className="flex h-full flex-col bg-wa-darkpanel overflow-y-auto">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-wa-darkborder">
        <button onClick={() => navigate(-1)} className="p-2 text-wa-subtext hover:text-white">
          <i className="bx bx-arrow-back text-xl"></i>
        </button>
        <h2 className="text-lg font-semibold text-white">Settings</h2>
      </div>

      <div className="flex-1 p-6 max-w-lg mx-auto w-full space-y-6">
        {/* Theme */}
        <Section title="Appearance">
          <div className="flex items-center justify-between py-3">
            <span className="text-white">Theme</span>
            <div className="flex rounded-lg bg-wa-darkinput p-1">
              <button
                onClick={() => updateSettings({ theme: "dark" })}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${settings.theme === "dark" ? "bg-wa-green text-white" : "text-wa-subtext"}`}
              >
                <i className="bx bx-moon mr-1"></i> Dark
              </button>
              <button
                onClick={() => updateSettings({ theme: "light" })}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${settings.theme === "light" ? "bg-wa-green text-white" : "text-wa-subtext"}`}
              >
                <i className="bx bx-sun mr-1"></i> Light
              </button>
            </div>
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <Toggle label="Notification sounds" checked={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
          <Toggle label="Typing indicators" checked={settings.typing} onChange={(v) => updateSettings({ typing: v })} />
          <Toggle label="Read receipts" checked={settings.receipts} onChange={(v) => updateSettings({ receipts: v })} />
        </Section>

        {/* Privacy */}
        <Section title="Privacy & Security">
          <InfoRow icon="bx-lock-alt" label="End-to-end encryption" value="Enabled" />
          <InfoRow icon="bx-key" label="E2EE Key" value="Generated" />
          <InfoRow icon="bx-shield" label="Zero-knowledge" value="Active" />
        </Section>

        {/* Account */}
        <Section title="Account">
          <button onClick={() => navigate("/profile")} className="flex w-full items-center justify-between py-3 hover:bg-wa-darkchat rounded-lg px-3 transition">
            <span className="text-white">Edit Profile</span>
            <i className="bx bx-chevron-right text-wa-subtext text-lg"></i>
          </button>
          <button onClick={signOut} className="flex w-full items-center justify-between py-3 hover:bg-wa-darkchat rounded-lg px-3 transition text-red-400">
            <span>Log Out</span>
            <i className="bx bx-log-out text-lg"></i>
          </button>
        </Section>

        <div className="text-center text-xs text-wa-subtext py-4">
          WhatsApp Clone v1.0.0<br />
          Built with React + Supabase + E2EE
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs text-wa-subtext uppercase tracking-wide mb-2 px-3">{title}</h3>
      <div className="rounded-xl bg-wa-darkchat overflow-hidden divide-y divide-wa-darkborder">{children}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 px-3">
      <span className="text-white">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-wa-green" : "bg-wa-darkinput"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-5" : "left-0.5"}`}></span>
      </button>
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-3 px-3">
      <span className="text-white flex items-center gap-2">
        <i className={`bx ${icon} text-wa-subtext`}></i>
        {label}
      </span>
      <span className="text-wa-subtext text-sm">{value}</span>
    </div>
  );
}
