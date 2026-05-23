import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const headingFont = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Anti-Selek",
  description: "Schedule matches, track scores, and maintain player ratings",
  applicationName: "Anti-Selek",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Anti-Selek",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#102236",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${headingFont.variable} ${monoFont.variable} antialiased`}>
        <div className="app-root-shell">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
