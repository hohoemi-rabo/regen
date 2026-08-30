// ESLint(要件§10.2「型チェック、Lint、ユニットテスト」)。
//
// ワークスペース全体をこの1本で見る。`eslint-config-next` は 15.5 時点でまだ
// eslintrc 形式しか配っていないので、FlatCompat 越しに読み込む(Next公式の手順)。
// バージョンは Next と同じ 15.5.24 に固定してある(「絶対に守ること」#1)。
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    // 生成物と成果物は見ない。data/ はバッチが吐くJSON、docs/prototype はブラウザで開く検証物
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.open-next/**",
      "**/.wrangler/**",
      "**/.cache/**",
      "data/**",
      "docs/**",
      "apps/web/next-env.d.ts",
      "apps/web/worker-configuration.d.ts",
      "packages/db/migrations/**",
    ],
  },

  // TypeScript共通。型情報を要求する規則は使わない(全パッケージ分の型を読むと
  // CIで数分かかるうえ、いまの指摘の質はそこまで必要としていない)
  ...tseslint.configs.recommended,
  {
    rules: {
      // catch した値を型で縛らない書き方(`e instanceof Error ? ... : String(e)`)を
      // 各所で使っているので、any そのものではなく明示的なキャストだけを禁じたい。
      // 既存コードに散らばる指摘を握りつぶさないよう warn ではなく error のまま、
      // 必要な箇所は個別に理由付きで無効化する
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Next.js のアプリだけに Next の規則を当てる
  ...compat.extends("next/core-web-vitals", "next/typescript").map((c) => ({
    ...c,
    files: ["apps/web/**/*.{ts,tsx}"],
  })),
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    settings: { next: { rootDir: "apps/web" } },
  },
];
