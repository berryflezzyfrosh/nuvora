export default function Splash() {
  return (
    <div className="flex h-full items-center justify-center bg-wa-dark">
      <div className="text-center fade-in">
        <div className="mb-6 flex justify-center">
          <svg viewBox="0 0 48 48" width="80" height="80" className="animate-pulse">
            <circle cx="24" cy="24" r="22" fill="#25D366" />
            <path
              d="M24 12c-6.6 0-12 5.4-12 12 0 2.1.5 4 1.5 5.7L12 36l6.5-1.5c1.7.9 3.6 1.5 5.5 1.5 6.6 0 12-5.4 12-12s-5.4-12-12-12zm0 22c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.8.9.9-3.7-.2-.4c-1-1.5-1.5-3.3-1.5-5.2 0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10z"
              fill="white"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-wider">WhatsApp Clone</h1>
        <p className="mt-2 text-wa-subtext">Connecting people securely...</p>
        <div className="mt-8 flex justify-center gap-2">
          <span className="typing-dot h-3 w-3 rounded-full bg-wa-green"></span>
          <span className="typing-dot h-3 w-3 rounded-full bg-wa-green"></span>
          <span className="typing-dot h-3 w-3 rounded-full bg-wa-green"></span>
        </div>
      </div>
    </div>
  );
}
