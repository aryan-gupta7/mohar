export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)", mid: "var(--mid)", surf: "var(--surf)", card: "var(--card)", line: "var(--line)",
        text: "var(--text)", mute: "var(--mute)",
        lime: "#b9e303", lav: "#a88ed4", sky: "#b5d5e1", graph: "#232323", warn: "#f5a524", bad: "#ff6b6b",
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'], mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'] },
      borderRadius: { xl2: "20px" },
    },
  },
  plugins: [],
};
