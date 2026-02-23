import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrisisLens",
  description:
    "Interactive humanitarian crisis globe with country-level population, funding, and needs analytics.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  manifest: "/site.webmanifest"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
