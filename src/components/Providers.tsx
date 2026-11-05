"use client";

import { SessionProvider } from "next-auth/react";
import { ClubDataProvider } from "./app/ClubDataProvider";
import { GoogleSignInContext } from "./GoogleSignIn";

export function Providers({ children, googleSignIn }: { children: React.ReactNode; googleSignIn: boolean }) {
  return (
    <SessionProvider>
      <GoogleSignInContext.Provider value={googleSignIn}>
        <ClubDataProvider>{children}</ClubDataProvider>
      </GoogleSignInContext.Provider>
    </SessionProvider>
  );
}
