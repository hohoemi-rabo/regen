import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regen ― 下り坂は、燃料になる。",
  description:
    "路線バスのEV化適性を、公共交通オープンデータと標高データだけで診断する意思決定支援サービス",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
