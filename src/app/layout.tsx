import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Manufacturing Ops Copilot",
  description: "AI-assisted quoting and procurement with human approval, backed by Odoo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-card focus:p-2"
        >
          Skip to content
        </a>
        <header className="border-b border-border bg-card">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 sm:px-6"
          >
            <Link href="/" className="font-semibold">
              Ops Copilot
            </Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              New request
            </Link>
            <Link href="/traces" className="text-sm text-muted-foreground hover:text-foreground">
              Traces
            </Link>
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
