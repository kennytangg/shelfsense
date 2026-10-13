"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, json, PlacementSettings, Shelf } from "./api";
import { FilePicker } from "./upload";
import { Notice } from "./ui";

export function PlacementForm({
  shelf,
  close,
}: {
  shelf: Shelf;
  close: () => void;
}) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<PlacementSettings>(
    shelf.placement_settings,
  );
  const saved = async () => {
    await client.invalidateQueries();
    close();
  };
  const setup = useMutation({
    mutationFn: async () => {
      if (!file && !shelf.placement_reference)
        throw new Error("Choose a correctly arranged shelf photo first.");
      const form = new FormData();
      const reference =
        file ||
        (await fetch(shelf.placement_reference!.url).then((r) => {
          if (!r.ok) throw new Error("Expected layout could not be loaded.");
          return r.blob();
        }));
      if (!reference)
        throw new Error("Choose a correctly arranged shelf photo first.");
      form.append("file", reference, "expected.png");
      form.append("config", JSON.stringify(settings));
      form.append("calibration_version", String(shelf.calibration_version));
      return api<Shelf>(`/shelves/${shelf.id}/placement`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: saved,
  });
  const demo = useMutation({
    mutationFn: () =>
      api<Shelf>(
        `/shelves/${shelf.id}/demo-placement`,
        json({
          calibration_version: shelf.calibration_version,
        }),
      ),
    onSuccess: saved,
  });
  const disable = useMutation({
    mutationFn: () =>
      api<Shelf>(`/shelves/${shelf.id}/placement`, { method: "DELETE" }),
    onSuccess: saved,
  });
  const pending = setup.isPending || demo.isPending || disable.isPending;
  return (
    <>
      <p>
        Use a correctly arranged full shelf photo from the same camera position
        as the empty reference.
      </p>
      <p className="muted">
        We compare the appearance of remaining products with this layout.
        Missing products affect stock coverage. Differences need staff review;
        this check cannot identify individual products.
      </p>
      {shelf.placement_reference && (
        <img
          className="upload-preview"
          src={shelf.placement_reference.url}
          alt="Saved expected shelf layout"
        />
      )}
      <FilePicker file={file} setFile={setFile} />
      <details>
        <summary>Appearance comparison settings</summary>
        <div className="form-grid">
          {(Object.keys(settings) as (keyof PlacementSettings)[]).map((key) => (
            <label key={key}>
              {key.replaceAll("_", " ")}
              <input
                type="number"
                step={key === "appearance_distance" ? 1 : 0.01}
                value={settings[key]}
                onChange={(e) =>
                  setSettings({ ...settings, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </div>
        <p className="muted">
          Mismatch threshold and minimum shared area are fractions from 0 to 1.
          Appearance distance controls color sensitivity.
        </p>
      </details>
      <Notice>
        Saving or disabling the expected layout requires a new shelf check.
        Recalibrating the empty reference disables placement review.
      </Notice>
      {(setup.error || demo.error || disable.error) && (
        <Notice error>
          {(setup.error || demo.error || disable.error)?.message}
        </Notice>
      )}
      <div className="actions">
        <button
          className="button"
          disabled={pending || (!file && !shelf.placement_reference)}
          onClick={() => setup.mutate()}
        >
          Save expected layout
        </button>
        {shelf.demo && (
          <button
            className="button secondary"
            disabled={pending}
            onClick={() => demo.mutate()}
          >
            Use correct demo layout
          </button>
        )}
        {shelf.placement_reference && (
          <button
            className="button secondary"
            disabled={pending}
            onClick={() => disable.mutate()}
          >
            Disable placement review
          </button>
        )}
      </div>
    </>
  );
}
