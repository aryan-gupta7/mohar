export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)", mid: "var(--mid)", surf: "var(--surf)", card: "var(--card)", line: "var(--line)",
        text: "var(--text)", mute: "var(--mute)",
        lime: "var(--mint)", mint: "var(--mint)", lav: "#9BD7E8", sky: "#7fb8b2", graph: "#2B2E2E", warn: "#f5c26b", bad: "#ff7a7a",
      },
      fontFamily: { sans: ['Poppins', 'system-ui', 'sans-serif'], mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'] },
      borderRadius: { xl2: "20px" },
    },
  },
  plugins: [],
};
