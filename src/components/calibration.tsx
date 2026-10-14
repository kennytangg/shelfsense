"use client";
import { uploadImage } from "./api";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ROI, Settings, Shelf } from "./api";
import { FilePicker } from "./upload";
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
  const [settings, setSettings] = useState<Settings>(shelf.settings);
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
        config: { roi, settings },
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
        Use an empty reference and a current photo taken from the same position.
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
            Drag across the product display area, or adjust the coordinates
            below. Green marks the selected area.
          </p>
          <div
            className="roi-canvas"
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
          <div className="form-grid">
            {(["x", "y", "width", "height"] as const).map((key) => (
              <label key={key}>
                {key.toUpperCase()} (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={Number((roi[key] * 100).toFixed(1))}
                  onChange={(e) =>
                    setRoi({ ...roi, [key]: Number(e.target.value) / 100 })
                  }
                />
              </label>
            ))}
          </div>
        </>
      )}
      <details>
        <summary>Advanced · Classification & detector settings</summary>
        <div className="form-grid">
          {(Object.keys(settings) as (keyof Settings)[]).map((key) => (
            <label key={key}>
              {key.replaceAll("_", " ")}
              <input
                type="number"
                step={key.includes("threshold") ? 0.01 : 1}
                value={settings[key]}
                onChange={(e) =>
                  setSettings({ ...settings, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </div>
        <p className="muted">
          Empty is below the empty threshold. Full starts at the full threshold.
          Values between are Low. Stock thresholds use fractions from 0 to 1.
        </p>
      </details>
      {shelf.calibration_version > 0 && (
        <Notice>
          Saving a calibration preserves history and requires a new shelf check.
        </Notice>
      )}
      {mutation.isError && <Notice error>{mutation.error.message}</Notice>}
      <button
        className="button"
        disabled={!preview || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Saving calibration…" : "Save calibration"}
      </button>
    </div>
  );
}
