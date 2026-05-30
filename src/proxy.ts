import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Only these paths require login — everything else is public
const PROTECTED = ["/scan", "/trades", "/accounts", "/dashboard", "/auto-trade", "/api/scan", "/api/trades", "/api/accounts", "/api/auto-trade", "/api/cron"];

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
