"use client";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  PackageOpen,
  X,
  Boxes,
} from "lucide-react";
import { useEffect, useId, useRef } from "react";
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
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previous;
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={close}
      aria-labelledby={titleId}
    >
      <div className="section-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
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
