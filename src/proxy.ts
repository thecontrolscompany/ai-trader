import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Only these paths require login — everything else is public.
// Leave /api/cron public so Vercel cron can reach the CRON_SECRET check in the route handler.
const PROTECTED = ["/scan", "/trades", "/accounts", "/dashboard", "/auto-trade", "/activity", "/admin", "/home", "/portfolios", "/api/scan", "/api/trades", "/api/accounts", "/api/auto-trade", "/api/deploy", "/api/portfolios", "/api/admin"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const needsAuth = PROTECTED.some((p) => pathname.startsWith(p));

  if (needsAuth && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|tim.png|shane.png).*)"],
};
