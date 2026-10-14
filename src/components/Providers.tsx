"use client";

import { SessionProvider } from "next-auth/react";
import { ClubDataProvider } from "./app/ClubDataProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><ClubDataProvider>{children}</ClubDataProvider></SessionProvider>;
}
