"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./ui";
export function Workspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="simple-workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="simple-header">
        <Link href="/" aria-label="ShelfSense home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          {[
            ["/", "Shelves"],
            ["/alerts", "Alerts"],
            ["/help", "Help"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={
                (
                  href === "/"
                    ? pathname === "/" || pathname.startsWith("/shelves/")
                    : pathname === href
                )
                  ? "page"
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
