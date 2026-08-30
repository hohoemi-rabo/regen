import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * apps/web の単体テスト。
 * 対象は依存の少ない純関数(CSVパーサ・補正の当てはめ)で、DOMは要らない。
 * 画面そのものの確認は preview(Workersランタイム)で行う。
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
