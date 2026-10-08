import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, Leaf } from "lucide-react";
import { Providers } from "@/components/providers";
import { Brand } from "@/components/ui";
import "./globals.css";
export const metadata: Metadata = {
  title: "ShelfSense · Store operations",
  description: "Check visible shelf coverage and coordinate restocking.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="topbar">
            <Link href="/" aria-label="ShelfSense home">
              <Brand />
            </Link>
            <span className="topbar-label">STORE OPERATIONS</span>
            <span className="demo-label">
              <Leaf size={14} />
              Local demonstration
            </span>
          </header>
          <div className="app-shell">
            <aside className="sidebar">
              <p className="eyebrow">WORKSPACE</p>
              <Link href="/" className="nav-item">
                <LayoutDashboard size={18} />
                Shelf overview
              </Link>
              <div className="sidebar-note">
                <span className="live-dot" /> Image-based shelf checks
                <p>
                  One zone. One clear reading.
                  <br />A practical restocking workflow.
                </p>
              </div>
            </aside>
            <main>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
