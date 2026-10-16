"use client";
import { useEffect, useState } from "react";
import { UploadCloud } from "lucide-react";
import { PhotoFrame } from "./photo-frame";
import { cn } from "@/lib/utils";
import { Notice } from "./shelf-ui";

export function FilePicker({
  file,
  setFile,
  children,
  disabled = false,
  prompt = "Choose a shelf photo",
  existingPreview = "",
}: {
  file: File | null;
  setFile: (file: File) => void;
  children?: React.ReactNode;
  disabled?: boolean;
  prompt?: string;
  existingPreview?: string;
}) {
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!file) {
      setPreview(existingPreview);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, existingPreview]);
  function select(file?: File) {
    if (!file || disabled) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Choose a PNG or JPEG image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be 10 MB or smaller.");
      return;
    }
    setError("");
    setFile(file);
  }
  return (
    <>
      {!children && (
        <PhotoFrame>
          {preview ? (
            <img
              className="h-full w-full object-contain"
              src={preview}
              alt="Selected shelf photo preview"
            />
          ) : (
            <span className="px-4">Choose a photo to preview it.</span>
          )}
        </PhotoFrame>
      )}
      <label
        className={cn(
          "relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input bg-background p-3 text-center text-sm leading-5 text-primary focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-ring hover:bg-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
          dragging && "bg-accent",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          select(e.dataTransfer.files[0]);
        }}
      >
        <UploadCloud size={20} aria-hidden="true" />
        <span>{preview ? "Replace photo" : prompt}</span>
        <span>PNG or JPEG · up to 10 MB</span>
        <input
          className="absolute inset-0 h-full w-full cursor-inherit opacity-0"
          type="file"
          disabled={disabled}
          aria-label="Shelf photo"
          accept="image/png,image/jpeg"
          onChange={(e) => select(e.target.files?.[0])}
        />
      </label>
      {file && (
        <p className="text-sm leading-5 text-muted-foreground wrap-anywhere">
          {file.name}
        </p>
      )}
      {error && <Notice error>{error}</Notice>}

      {children}
    </>
  );
}
