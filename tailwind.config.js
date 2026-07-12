/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        wa: {
          green: "#25D366",
          teal: "#128C7E",
          dark: "#075E54",
          light: "#E7F8F0",
          bg: "#ECE5DD",
          panel: "#F0F2F5",
          darkbg: "#0B141A",
          darkpanel: "#111B21",
          darkchat: "#1D2B33",
          darkinput: "#202C33",
          darkborder: "#2A3942",
          text: "#111B21",
          subtext: "#667781",
          bubbleout: "#D9FDD3",
          bubblein: "#FFFFFF",
          darkbubbleout: "#005C4B",
          darkbubblein: "#202C33",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "slide-in": "slideIn 0.3s ease-out",
        "pop-in": "popIn 0.2s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        popIn: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
