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
      <header className="mb-6 flex flex-col items-start justify-between gap-3 border-b py-4 text-sm sm:flex-row sm:items-center sm:py-6">
        <Link href="/" aria-label="ShelfSense home">
          <Brand />
        </Link>
        <nav
          className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto"
          aria-label="Main navigation"
        >
          {[
            ["/", "Shelves"],
            ["/help", "Help"],
          ].map(([href, label]) => (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-muted-foreground underline-offset-4 hover:underline aria-[current=page]:bg-secondary sm:aria-[current=page]:bg-transparent aria-[current=page]:font-bold aria-[current=page]:text-foreground aria-[current=page]:underline"
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
