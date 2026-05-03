import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      isQuickAccess: boolean;
      quickAccessCommunityId?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    isAdmin: boolean;
    isQuickAccess?: boolean;
    quickAccessCommunityId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isAdmin: boolean;
    isQuickAccess: boolean;
    quickAccessCommunityId?: string | null;
  }
}
