import type { Config } from "tailwindcss";

/**
 * トークンの正本は docs/DESIGN.md。値はすべて globals.css のCSS変数経由で参照する。
 * コンポーネントに生のhexを書かない(DESIGN §11)。
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        surface: "var(--surface)",
        "surface-dark": "var(--surface-dark)",
        "ink-1": "var(--ink-1)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        "ink-on-dark": "var(--ink-on-dark)",
        line: "var(--border)", // 罫線(border-line / divide-line)
        grid: "var(--grid)",
        baseline: "var(--baseline)",
        verdict: {
          ok: "var(--verdict-ok)",
          cond: "var(--verdict-cond)", // 図形専用(地図の線・凡例マーカー)
          "cond-text": "var(--verdict-cond-text)", // 文字はこちら(DESIGN §2.3)
          ng: "var(--verdict-ng)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          weak: "var(--accent-weak)",
        },
        "chart-series2": "var(--chart-series2)",
      },
      borderRadius: {
        card: "12px",
        tile: "10px",
        btn: "8px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
      // §3.2 タイポスケール。本文14px未満は注記・出典のみ
      fontSize: {
        hero: ["44px", { lineHeight: "1.1", fontWeight: "600" }],
        tile: ["26px", { lineHeight: "1.2", fontWeight: "600" }],
        "page-title": ["22px", { lineHeight: "1.35", fontWeight: "600" }],
        section: ["15px", { lineHeight: "1.5", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.7" }],
        aux: ["13px", { lineHeight: "1.6" }],
        note: ["12px", { lineHeight: "1.5" }],
        "note-sm": ["11px", { lineHeight: "1.5" }],
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "var(--font-noto)",
          "system-ui",
          "-apple-system",
          "Hiragino Sans",
          "Yu Gothic UI",
          "sans-serif",
        ],
      },
      spacing: {
        "card-gap": "22px",
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        slow: "var(--motion-slow)",
      },
    },
  },
  plugins: [],
};
export default config;
