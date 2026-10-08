"use client";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, ScanLine } from "lucide-react";
import { api, Analysis, percent, Shelf } from "./api";
import { Modal, Notice, Status } from "./ui";

export function FilePicker({
  file,
  setFile,
  children,
}: {
  file: File | null;
  setFile: (file: File) => void;
  children?: React.ReactNode;
}) {
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(file?: File) {
    if (!file) return;
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
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          select(e.dataTransfer.files[0]);
        }}
      >
        <UploadCloud size={26} />
        <strong>{file ? file.name : "Choose a shelf photo"}</strong>
        <span>or drop it here · PNG or JPEG · up to 10 MB</span>
        <input
          type="file"
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
      const form = new FormData();
      form.append("file", file!);
      return api<Analysis>(`/shelves/${shelf.id}/analyses`, {
        method: "POST",
        body: form,
      });
    },
    onSettled: () => client.invalidateQueries(),
  });
  return (
    <Modal title={`Check ${shelf.identifier}`} close={close}>
      <p className="muted">
        Use a current photo taken from the same position as the empty reference.
      </p>
      <FilePicker
        file={file}
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
          Done
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
