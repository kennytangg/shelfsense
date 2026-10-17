"use client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { PhotoFrame } from "./photo-frame";
import { uploadImage } from "./api-client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ROI, Shelf } from "./api-client";
import { FilePicker } from "./image-upload";
import { DetailsDialog } from "./details-dialog";
import { Notice } from "./shelf-ui";

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
    <>
      <div className="mt-6 grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        <Card
          role="region"
          className="workflow-panel min-w-0 gap-4 p-4 text-base leading-6 shadow-none"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 text-lg font-bold leading-6">
              Empty shelf reference
            </h2>
            <DetailsDialog title="Setup guidance">
              Use an empty shelf as the baseline. Repeat setup if the camera
              moves. Drag across the area to monitor, or focus the selection and
              use arrow keys to move it; hold Shift to resize.
            </DetailsDialog>
          </div>
          <FilePicker
            existingPreview={shelf.reference?.url}
            file={file}
            setFile={setFile}
            disabled={mutation.isPending}
            prompt="Choose an empty reference photo"
          />
          <div className="flex flex-wrap items-center gap-2 text-base leading-6">
            Choose an empty shelf photo, then mark the area to monitor.
          </div>
        </Card>
        <Card
          role="region"
          className="workflow-panel min-w-0 gap-4 p-4 text-base leading-6 shadow-none"
        >
          <h2 className="text-lg font-bold leading-6">Area to monitor</h2>
          <p className="text-sm leading-5 text-muted-foreground">
            This is the same reference photo. Drag to select the shelf area to
            measure in future photos. The outlined area is monitored; the rest
            is ignored. By default, the entire image is selected.
          </p>
          {!preview && <PhotoFrame>Upload an empty photo first.</PhotoFrame>}
          {preview && (
            <>
              <PhotoFrame className="roi-frame [container-type:size]">
                <div
                  className="roi-canvas relative w-fit max-w-full touch-none cursor-crosshair select-none"
                  tabIndex={0}
                  role="group"
                  aria-label="Shelf area selection. Arrow keys move; Shift and arrow keys resize."
                  onKeyDown={(e) => {
                    if (
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(e.key)
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
                      e.key === "ArrowUp"
                        ? -0.01
                        : e.key === "ArrowDown"
                          ? 0.01
                          : 0;
                    setRoi((r) =>
                      e.shiftKey
                        ? {
                            ...r,
                            width: Math.max(
                              0.01,
                              Math.min(1 - r.x, r.width + dx),
                            ),
                            height: Math.max(
                              0.01,
                              Math.min(1 - r.y, r.height + dy),
                            ),
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
                      width: Math.max(
                        0.001,
                        Math.abs(end.x - origin.current.x),
                      ),
                      height: Math.max(
                        0.001,
                        Math.abs(end.y - origin.current.y),
                      ),
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
                    className="block h-auto max-h-[100cqh] w-auto max-w-full"
                    draggable={false}
                    src={preview}
                    alt="Setup reference; draw the measurement region"
                  />
                  <div
                    className="pointer-events-none absolute border-2 border-primary bg-primary/15"
                    style={{
                      left: `${roi.x * 100}%`,
                      top: `${roi.y * 100}%`,
                      width: `${roi.width * 100}%`,
                      height: `${roi.height * 100}%`,
                    }}
                  />
                </div>
              </PhotoFrame>
              <Button
                variant="outline"
                onClick={() => setRoi({ x: 0, y: 0, width: 1, height: 1 })}
              >
                Use entire image
              </Button>
            </>
          )}
        </Card>
        <div className="col-span-full flex flex-col items-start gap-4 text-sm [&>button]:max-sm:w-full">
          <p className="text-muted-foreground">
            Save your reference and selected area, then check a current shelf
            photo.
          </p>
          {shelf.calibration_version > 0 && (
            <Notice>
              Saving setup preserves history and requires a new shelf check.
            </Notice>
          )}
          {mutation.isPending && (
            <Notice variant="processing">Saving setup…</Notice>
          )}
          {mutation.isError && <Notice error>{mutation.error.message}</Notice>}
          <Button
            disabled={!preview || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving setup…" : "Save setup"}
          </Button>
        </div>
      </div>
    </>
  );
}
