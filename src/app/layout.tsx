import type { Metadata } from "next";
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
  appleWebApp: {
    capable: true,
    title: "Anti-Selek",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${headingFont.variable} ${monoFont.variable} antialiased`}>
        <div className="relative min-h-screen overflow-x-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_transparent_60%)]" />
          <div className="pointer-events-none absolute left-[-8rem] top-20 h-56 w-56 rounded-full bg-[rgba(22,119,242,0.14)] blur-3xl" />
          <div className="pointer-events-none absolute right-[-7rem] top-28 h-64 w-64 rounded-full bg-[rgba(25,154,97,0.14)] blur-3xl" />
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
