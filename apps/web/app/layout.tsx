import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "./_components/SiteHeader";
import { SiteFooter } from "./_components/SiteFooter";
import { CalibrationProvider } from "./_components/calibration/CalibrationProvider";

// ウェイトは400/600の2段のみ(DESIGN §3.1)
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-noto",
  display: "swap",
  preload: false, // 日本語サブセットは大きいためswap任せ
});

export const metadata: Metadata = {
  title: "Regen ― 下り坂は、燃料になる。",
  description:
    "路線バスのEV化適性を、公共交通オープンデータと標高データだけで診断する意思決定支援サービス",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${inter.variable} ${notoSansJP.variable}`}>
      <body className="flex min-h-screen flex-col bg-page font-sans text-body text-ink-1 antialiased">
        {/* じぶん補正(F-4)はブラウザのローカル保存。childrenはServer Componentのまま通る */}
        <CalibrationProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </CalibrationProvider>
      </body>
    </html>
  );
}
