export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)", card: "var(--card)", fg: "var(--fg)", mute: "var(--mute)", faint: "var(--faint)", line: "var(--line)",
        accent: "var(--accent)", ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)",
      },
      fontFamily: { sans: ['"Inter Variable"', "system-ui", "sans-serif"], mono: ['"JetBrains Mono Variable"', "ui-monospace", "monospace"] },
      borderRadius: { DEFAULT: "10px", lg: "14px", xl: "18px" },
    },
  },
  plugins: [],
};
