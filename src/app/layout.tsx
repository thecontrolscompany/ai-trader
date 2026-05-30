import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { auth } from "@/auth";
import NavBar from "@/components/NavBar";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tim & Shane Stocks — AI Paper Trading",
  description: "AI-powered paper trading platform",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body className={`${geist.className} bg-background text-foreground min-h-screen`}>
        <NavBar
          userName={session?.user?.name}
          userImage={session?.user?.image}
        />
        <main className="max-w-6xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
