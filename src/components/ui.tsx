"use client";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  PackageOpen,
  Boxes,
} from "lucide-react";
export function Status({ status }: { status: string }) {
  const Icon =
    status === "Full" || status === "Matches reference"
      ? CheckCircle2
      : status === "Low" || status === "Placement review"
        ? AlertCircle
        : status === "Empty"
          ? PackageOpen
          : CircleDashed;
  return (
    <span
      className={`badge status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      <Icon size={14} />
      {status}
    </span>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`notice ${error ? "error" : ""}`}
    >
      {children}
    </div>
  );
}
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <Boxes size={24} />
      </span>
      Shelf<span className="brand-accent">Sense</span>
    </span>
  );
}
