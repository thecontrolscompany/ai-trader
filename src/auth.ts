import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Comma-separated list of Google emails allowed to log in.
// Set ALLOWED_EMAILS in your .env.local and Vercel env vars.
// Example: ALLOWED_EMAILS=tim@gmail.com,shane@gmail.com
const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],

  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // Deny everyone if no allowlist is configured — fail secure
      if (allowedEmails.length === 0) return false;
      return allowedEmails.includes(user.email.toLowerCase());
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },
});
