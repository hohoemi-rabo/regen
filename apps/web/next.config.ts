import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// next dev 中でも getCloudflareContext() でバインディング(ローカルD1/R2)が使えるようにする
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  transpilePackages: ["@regen/core", "@regen/db"],
};

export default nextConfig;
