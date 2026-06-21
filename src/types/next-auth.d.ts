import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      isQuickAccess: boolean;
      quickAccessClubId?: string | null;
      quickAccessCommunityId?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    isAdmin: boolean;
    isQuickAccess?: boolean;
    quickAccessClubId?: string | null;
    quickAccessCommunityId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isAdmin: boolean;
    isQuickAccess: boolean;
    quickAccessClubId?: string | null;
    quickAccessCommunityId?: string | null;
  }
}
