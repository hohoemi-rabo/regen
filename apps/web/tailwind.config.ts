import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 判定の意味色(ダッシュボード全体で統一)
        verdict: {
          ok: "#0ca30c",       // 適
          cond: "#b45309",     // 条件付き(テキスト用の濃いアンバー)
          condBg: "#fab219",   // 条件付き(マーカー用)
          ng: "#d03b3b",       // 要検討
        },
        accent: "#2a78d6",
      },
    },
  },
  plugins: [],
};
export default config;
