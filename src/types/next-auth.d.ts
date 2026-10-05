import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      userId?: string | null;
      guestPlayerId?: string | null;
      identityVersion?: number;
      isAdmin: boolean;
      isQuickAccess: boolean;
      quickAccessClubId?: string | null;
      quickAccessCommunityId?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    sessionVersion?: number;
    guestPlayerId?: string | null;
    isAdmin: boolean;
    isQuickAccess?: boolean;
    quickAccessClubId?: string | null;
    quickAccessCommunityId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionVersion?: number;
    identityVersion?: number;
    guestPlayerId?: string | null;
    id: string;
    isAdmin: boolean;
    isQuickAccess: boolean;
    quickAccessClubId?: string | null;
    quickAccessCommunityId?: string | null;
  }
}
