"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  LayoutDashboard,
  MapPin,
  ScanLine,
} from "lucide-react";
import { api, Dashboard, Store } from "./api";
import { Brand } from "./ui";

export function Workspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const store = useQuery({
    queryKey: ["store"],
    queryFn: () => api<Store>("/store"),
  });
  const summary = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/dashboard"),
  });
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" aria-label="ShelfSense home">
          <Brand />
        </Link>
        <div className="store-switcher">
          <MapPin size={20} />
          <div>
            <strong>{store.data?.name || "ShelfSense store"}</strong>
            <span>{store.data?.location || "Store workspace"}</span>
          </div>
        </div>
        <p className="eyebrow">OPERATIONS</p>
        <nav aria-label="Main navigation">
          <Link
            href="/"
            className={`nav-item ${pathname === "/" ? "active" : ""}`}
            aria-current={pathname === "/" ? "page" : undefined}
          >
            <LayoutDashboard size={18} />
            Overview
            <ArrowUpRight size={16} />
          </Link>
          <Link
            href="/#zones"
            className={`nav-item ${pathname.startsWith("/shelves/") ? "active" : ""}`}
          >
            <Boxes size={18} />
            Shelf zones
          </Link>
          <Link href="/#attention" className="nav-item">
            <AlertTriangle size={18} />
            Attention queue
            {summary.data && (
              <span className="nav-count">{summary.data.attention.length}</span>
            )}
          </Link>
        </nav>
        <div className="sidebar-note">
          <ScanLine size={27} />
          <strong>A clearer view of every shelf.</strong>
          <p>Check coverage. Coordinate restocking. Verify with a photo.</p>
          <span className="local-label">
            <span className="live-dot" />
            Local demonstration
          </span>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <Link href="/" className="mobile-brand" aria-label="ShelfSense home">
            <Brand />
          </Link>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span>/</span>
            <Link href="/">Overview</Link>
            {pathname !== "/" && (
              <>
                <span>/</span>
                <strong>Shelf details</strong>
              </>
            )}
          </div>
          <span className="monitoring-label">
            <ScanLine size={15} />
            Photo-based monitoring
          </span>
        </header>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <Link href="/">Overview</Link>
          <Link href="/#zones">Shelf zones</Link>
          <Link href="/#attention">
            Attention {summary.data ? `(${summary.data.attention.length})` : ""}
          </Link>
        </nav>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
