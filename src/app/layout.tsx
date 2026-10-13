import type { Metadata, Viewport } from "next";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

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
  themeColor: "#fffaf3",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <div className="app-root-shell">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
