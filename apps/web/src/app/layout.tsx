import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "CadenceAI",
  description: "Local orchestration for specialized coding agents",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-[color:var(--border)] px-6 py-4 flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              cadenceai
            </Link>
            <nav className="flex items-center gap-4 text-sm text-[color:var(--muted)]">
              <Link href="/" className="hover:text-white">Dashboard</Link>
              <Link href="/preview" className="hover:text-white">Run preview</Link>
              <Link href="/tasks/new" className="hover:text-white">New task</Link>
              <Link href="/repositories/new" className="hover:text-white">Add repository</Link>
            </nav>
            <span className="ml-auto text-xs text-[color:var(--muted)]">
              internal alpha · local-first
            </span>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
