"use client";
import { Button } from "./ui/button";
import { shelfPresentation } from "./shelf-presentation";
import Link from "next/link";
import { Camera, MapPin, Check } from "lucide-react";
import type { Shelf } from "./api-client";

export function ShelfHeader({
  title,
  shelf,
  children,
}: {
  title: string;
  shelf?: Shelf;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
        <h1 className="min-w-0 text-[1.75rem] leading-tight tracking-tight wrap-anywhere">
          {title}
        </h1>
        {shelf && (
          <p className="mt-2 flex items-center gap-1 text-sm leading-5 text-muted-foreground wrap-anywhere">
            <MapPin className="shrink-0" size={14} aria-hidden="true" />{" "}
            {shelf.name !== title && `${shelf.name} · `}
            {shelf.location}
            {shelf.demo ? " · Sample shelf" : ""}
          </p>
        )}
      </div>
      {children && (
        <div className="flex w-full flex-wrap items-center gap-2 max-sm:justify-end sm:w-auto [&>a:first-child]:max-sm:flex-1">
          {children}
        </div>
      )}
    </header>
  );
}
/** The same label and destination as the dashboard card for this shelf. */
export function ShelfAction({ shelf }: { shelf: Shelf }) {
  const presentation = shelfPresentation(shelf);
  return (
    <Button asChild>
      <Link href={presentation.href}>
        <Camera className="size-4 shrink-0" aria-hidden="true" />
        {presentation.action}
      </Link>
    </Button>
  );
}

export function WorkflowProgress({ stage }: { stage: "add" | "setup" }) {
  const current = stage === "add" ? 0 : 1;
  return (
    <nav
      className="workflow-progress my-6 text-sm leading-5"
      aria-label="Shelf progress"
    >
      <ol className="grid gap-3 sm:grid-cols-3">
        {["Add shelf", "Set up shelf", "Check stock"].map((label, index) => (
          <li
            key={label}
            className={
              index < current
                ? "progress-complete flex items-center gap-3 text-foreground"
                : index === current
                  ? "progress-current flex items-center gap-3 font-bold text-primary"
                  : "progress-next flex items-center gap-3 text-muted-foreground"
            }
            aria-current={index === current ? "step" : undefined}
          >
            <span
              data-step-marker
              className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-normal leading-none tabular-nums ${index === current ? "border-primary bg-primary text-primary-foreground" : index < current ? "border-accent bg-accent text-foreground" : "border-current"}`}
            >
              {index < current ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>
            <span>{label}</span>
            <span className="sr-only">
              {index < current
                ? "Completed"
                : index === current
                  ? "Current step"
                  : "Upcoming"}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
