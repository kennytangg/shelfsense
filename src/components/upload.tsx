"use client";
import { uploadImage } from "./api";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, ScanLine } from "lucide-react";
import { api, Analysis, percent, Shelf } from "./api";
import { Modal, Notice, Status } from "./ui";

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
        <span>or drop it here · PNG or JPEG · up to 10 MB</span>
        <input
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

export function UploadModal({
  shelf,
  close,
}: {
  shelf: Shelf;
  close: () => void;
}) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      return uploadImage<Analysis>(shelf.id, "analyses", file!);
    },
    onSettled: () => client.invalidateQueries(),
  });
  return (
    <Modal title={`Check ${shelf.identifier}`} close={close}>
      <ol className="step-strip" aria-label="Photo check steps">
        <li className={!file ? "current" : ""}>
          <span>01</span>Choose photo
        </li>
        <li className={file && !mutation.data ? "current" : ""}>
          <span>02</span>Analyze shelf
        </li>
        <li className={mutation.data ? "current" : ""}>
          <span>03</span>Review result
        </li>
      </ol>
      <p className="muted">
        Use a current photo taken from the same position as the empty reference.
      </p>
      <div className="upload-context">
        {shelf.reference && (
          <img
            src={shelf.reference.url}
            alt="Empty reference for matching camera position"
          />
        )}
        <div>
          <strong>{shelf.name}</strong>
          <p>{shelf.location} · Match the reference framing and lighting.</p>
        </div>
      </div>
      {shelf.awaiting_verification && (
        <Notice>
          Verification check: a new valid photo will confirm whether this shelf
          has recovered.
        </Notice>
      )}
      <FilePicker
        file={file}
        disabled={mutation.isPending}
        setFile={(file) => {
          setFile(file);
          mutation.reset();
        }}
      />
      {mutation.isError && <Notice error>{mutation.error.message}</Notice>}
      {mutation.data && (
        <Notice>
          <Status
            status={mutation.data.classification || mutation.data.outcome}
          />{" "}
          {mutation.data.classification
            ? `${percent(mutation.data.occupancy_ratio)} estimated occupied area. Reading saved.`
            : mutation.data.warnings.join(" ")}
        </Notice>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={close}>
          {mutation.data ? "Done" : "Cancel"}
        </button>
        <button
          className="button"
          disabled={!file || mutation.isPending || mutation.isSuccess}
          onClick={() => mutation.mutate()}
        >
          <ScanLine size={17} />
          {mutation.isPending ? "Processing image…" : "Analyze image"}
        </button>
      </div>
    </Modal>
  );
}
