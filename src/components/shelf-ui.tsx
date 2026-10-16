"use client";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  PackageOpen,
  Boxes,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { cn } from "@/lib/utils";
export function Status({ status }: { status: string }) {
  const value = status;
  const Icon =
    value === "Full" || value === "Matches reference"
      ? CheckCircle2
      : value === "Low" || value === "Placement review"
        ? AlertCircle
        : value === "Empty"
          ? PackageOpen
          : CircleDashed;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "max-w-full gap-1.5 whitespace-normal text-sm font-normal leading-5",
        value === "Full" && "bg-success-background text-success",
        value === "Low" && "bg-warning-background text-warning",
        value === "Empty" && "bg-danger-background text-destructive",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {status}
    </Badge>
  );
}
export function Notice({
  children,
  error = false,
  variant = "info",
}: {
  children: React.ReactNode;
  error?: boolean;
  variant?: "info" | "processing" | "success" | "warning" | "error";
}) {
  const kind = error ? "error" : variant;
  return (
    <Alert
      role={
        kind === "error"
          ? "alert"
          : kind === "processing" || kind === "success"
            ? "status"
            : undefined
      }
      className={cn(
        "my-4 p-4 text-base leading-6",
        kind === "error" &&
          "border-destructive/30 bg-danger-background text-destructive",
        kind === "success" && "bg-success-background text-success",
        kind === "warning" && "bg-warning-background text-warning",
        kind === "processing" && "border-dashed",
      )}
    >
      {kind === "success" && (
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      )}
      <AlertDescription className="text-base leading-6 text-inherit wrap-anywhere">
        {children}
      </AlertDescription>
    </Alert>
  );
}
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-serif text-base font-bold text-primary">
      <Boxes className="size-6 shrink-0" aria-hidden="true" />
      ShelfSense
    </span>
  );
}
