import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isGlobalAdminEmail, normalizeAuthEmail } from "@/lib/globalAdmin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = normalizeAuthEmail(credentials.email as string);
        if (!normalizedEmail) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email ?? normalizedEmail,
          name: user.name,
          isAdmin: isGlobalAdminEmail(user.email ?? normalizedEmail),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (typeof user.id === "string") {
          token.id = user.id;
        }
        if (typeof user.email === "string") {
          token.email = user.email;
        }
        token.isAdmin = !!user.isAdmin;
      } else if (typeof token.email === "string") {
        token.isAdmin = isGlobalAdminEmail(token.email);
      }
      if (typeof token.isAdmin !== "boolean") token.isAdmin = false;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.isAdmin = !!token.isAdmin;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
});
