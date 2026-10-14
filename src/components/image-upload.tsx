"use client";
import { useEffect, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Notice } from "./ui";

export function FilePicker({
  file,
  setFile,
  children,
  disabled = false,
  prompt = "Choose a shelf photo",
}: {
  file: File | null;
  setFile: (file: File) => void;
  children?: React.ReactNode;
  disabled?: boolean;
  prompt?: string;
}) {
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
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
      <label
        className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
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
        <UploadCloud size={26} />
        <strong>{file ? file.name : prompt}</strong>
        <span>Click to upload or drag &amp; drop</span>
        <span>PNG or JPEG · up to 10 MB</span>
        <input
          className="dropzone-input"
          type="file"
          disabled={disabled}
          aria-label="Shelf photo"
          accept="image/png,image/jpeg"
          onChange={(e) => select(e.target.files?.[0])}
        />
      </label>
      {error && <Notice error>{error}</Notice>}
      {preview && !children && (
        <img
          className="upload-preview"
          src={preview}
          alt="Selected shelf photo preview"
        />
      )}
      {children}
    </>
  );
}
