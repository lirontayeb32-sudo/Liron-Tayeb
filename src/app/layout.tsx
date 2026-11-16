import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "תכלת — מנוע מכירות", template: "%s · תכלת" },
  description: "מערכת מכירות לתכלת תיירות",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "תכלת", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#095c9d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
