"use client";
import { uploadImage } from "./api-client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ROI, Shelf } from "./api-client";
import { FilePicker } from "./image-upload";
import { Notice } from "./ui";

export function CalibrationForm({
  shelf,
  done,
}: {
  shelf: Shelf;
  done: () => void;
}) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(shelf.reference?.url || "");
  const [roi, setRoi] = useState<ROI>(
    shelf.roi || { x: 0, y: 0, width: 1, height: 1 },
  );
  const origin = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const mutation = useMutation({
    mutationFn: async () => {
      // Existing immutable reference may be reused when adjusting calibration.
      const reference =
        file ||
        (await fetch(shelf.reference!.url).then((r) => {
          if (!r.ok) throw new Error("Reference could not be loaded.");
          return r.blob();
        }));
      if (!reference) throw new Error("Choose an empty reference image first.");
      return uploadImage<Shelf>(shelf.id, "calibration", reference, {
        config: { roi },
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries();
      done();
    },
  });
  function point(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }
  return (
    <div className="calibration-form">
      <ol className="step-strip" aria-label="Calibration steps">
        <li className={!preview ? "current" : ""}>
          <span>01</span>Empty reference
        </li>
        <li className={preview ? "current" : ""}>
          <span>02</span>Select area
        </li>
        <li>
          <span>03</span>Save & check
        </li>
      </ol>
      <p>
        Upload a photo of this shelf while empty. This baseline lets ShelfSense
        estimate visible stock from later photos. Repeat setup if the camera
        position changes.
      </p>
      <h3 className="form-section-title">
        <span>01</span>Start with an empty shelf
      </h3>
      <FilePicker
        file={file}
        setFile={setFile}
        disabled={mutation.isPending}
        prompt="Choose an empty reference photo"
      >
        <span />
      </FilePicker>
      {preview && (
        <>
          <h3 className="form-section-title">
            <span>02</span>Choose the area to monitor
          </h3>
          <p className="muted">
            Drag across the shelf area. You can also focus the image and use
            arrow keys to move the selection; hold Shift to resize it. Green
            marks the selected area.
          </p>
          <div
            className="roi-canvas"
            tabIndex={0}
            role="group"
            aria-label="Shelf area selection. Arrow keys move; Shift and arrow keys resize."
            onKeyDown={(e) => {
              if (
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              )
                return;
              e.preventDefault();
              const dx =
                e.key === "ArrowLeft"
                  ? -0.01
                  : e.key === "ArrowRight"
                    ? 0.01
                    : 0;
              const dy =
                e.key === "ArrowUp" ? -0.01 : e.key === "ArrowDown" ? 0.01 : 0;
              setRoi((r) =>
                e.shiftKey
                  ? {
                      ...r,
                      width: Math.max(0.01, Math.min(1 - r.x, r.width + dx)),
                      height: Math.max(0.01, Math.min(1 - r.y, r.height + dy)),
                    }
                  : {
                      ...r,
                      x: Math.max(0, Math.min(1 - r.width, r.x + dx)),
                      y: Math.max(0, Math.min(1 - r.height, r.y + dy)),
                    },
              );
            }}
            onPointerDown={(e) => {
              origin.current = point(e);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!origin.current) return;
              const end = point(e);
              setRoi({
                x: Math.min(origin.current.x, end.x),
                y: Math.min(origin.current.y, end.y),
                width: Math.max(0.001, Math.abs(end.x - origin.current.x)),
                height: Math.max(0.001, Math.abs(end.y - origin.current.y)),
              });
            }}
            onPointerUp={() => {
              origin.current = null;
            }}
            onPointerCancel={() => {
              origin.current = null;
            }}
          >
            <img
              draggable={false}
              src={preview}
              alt="Empty reference; draw the measurement region"
            />
            <div
              className="roi-box"
              style={{
                left: `${roi.x * 100}%`,
                top: `${roi.y * 100}%`,
                width: `${roi.width * 100}%`,
                height: `${roi.height * 100}%`,
              }}
            />
          </div>
          <button
            className="button secondary small"
            onClick={() => setRoi({ x: 0, y: 0, width: 1, height: 1 })}
          >
            Use entire image
          </button>
        </>
      )}
      {shelf.calibration_version > 0 && (
        <Notice>
          Saving setup preserves history and requires a new shelf check.
        </Notice>
      )}
      {mutation.isError && <Notice error>{mutation.error.message}</Notice>}
      <button
        className="button"
        disabled={!preview || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Saving setup…" : "Save setup"}
      </button>
    </div>
  );
}
