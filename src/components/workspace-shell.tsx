"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./shelf-ui";
export function Workspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCollection = pathname === "/" || pathname === "/alerts";
  return (
    <div className="mx-auto max-w-[90rem] px-4 pb-12 sm:px-8">
      <a
        className="fixed -top-24 left-5 z-50 rounded-lg bg-card p-3 focus:top-3"
        href="#main-content"
      >
        Skip to content
      </a>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b py-6 text-sm">
        <Link href="/" aria-label="ShelfSense home">
          <Brand />
        </Link>
        <nav className="flex gap-3" aria-label="Main navigation">
          {[
            ["/", "Shelves"],
            ["/help", "Help"],
          ].map(([href, label]) => (
            <Link
              className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-muted-foreground underline-offset-4 hover:underline aria-[current=page]:bg-accent aria-[current=page]:text-foreground"
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
      <main
        id="main-content"
        className={
          isCollection || pathname.startsWith("/shelves/")
            ? "collection-page mx-auto min-w-0 max-w-6xl"
            : "reading-container mx-auto min-w-0 max-w-[44rem]"
        }
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
