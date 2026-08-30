import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// next dev 中でも getCloudflareContext() でバインディング(ローカルD1/R2)が使えるようにする
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  transpilePackages: ["@regen/core", "@regen/db"],
  experimental: {
    // ビルド時のプリレンダリングは D1(ローカルはminiflareのSQLite)を読む。
    // ワーカーを並列に立てると各プロセスが同じSQLiteを掴んで SQLITE_BUSY で落ちるため直列にする。
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
