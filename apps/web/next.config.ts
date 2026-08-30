import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// next dev 中でも getCloudflareContext() でバインディング(ローカルD1/R2)が使えるようにする
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  transpilePackages: ["@regen/core", "@regen/db"],
  images: {
    // **next/image は使わない**(チケット12で確定)。図版は public/ の静的アセットを
    // 素の <img> + 明示的な width/height で出す。Workersでは既定の画像最適化ローダーが
    // 動かないため。ここを立てておくと、うっかり next/image を使っても
    // 500 ではなく素の <img> 相当に落ちる。
    unoptimized: true,
  },
  experimental: {
    // ビルド時のプリレンダリングは D1(ローカルはminiflareのSQLite)を読む。
    // ワーカーを並列に立てると各プロセスが同じSQLiteを掴んで SQLITE_BUSY で落ちるため直列にする。
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
