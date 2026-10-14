"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Upload,
  SlidersHorizontal,
  Play,
  Check,
  PackageCheck,
  MapPin,
  Clock3,
} from "lucide-react";
import { Alert, Analysis, api, date, json, percent, Shelf } from "./api";
import { Modal, Notice, Status } from "./ui";
import { UploadModal } from "./upload";
import { CalibrationForm } from "./calibration";
import { PlacementForm } from "./placement";

export function ShelfDetail({ id }: { id: string }) {
  const client = useQueryClient();
  const [upload, setUpload] = useState(false);
  const [setup, setSetup] = useState(false);
  const [placementSetup, setPlacementSetup] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [sample, setSample] = useState("low");
  const [selected, setSelected] = useState<Analysis | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("setup"))
      setSetup(true);
  }, []);
  const shelfQuery = useQuery({
    queryKey: ["shelf", id],
    queryFn: () => api<Shelf>(`/shelves/${id}`),
  });
  const history = useQuery({
    queryKey: ["history", id],
    queryFn: () => api<Analysis[]>(`/shelves/${id}/analyses`),
  });
  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api<Alert[]>("/alerts"),
  });
  const demo = useMutation({
    mutationFn: () =>
      api<Analysis>(`/shelves/${id}/demo-analysis`, json({ sample })),
    onSettled: () => client.invalidateQueries(),
  });
  const action = useMutation({
    mutationFn: ({ alertId, action }: { alertId: string; action: string }) =>
      api<Alert>(`/alerts/${alertId}`, json({ action }, "PATCH")),
    onSettled: () => client.invalidateQueries(),
  });
  const shelf = shelfQuery.data;
  if (!shelf)
    return (
      <>
        <Link className="back-link" href="/">
          <ArrowLeft size={16} />
          Shelf overview
        </Link>
        <Notice error={shelfQuery.isError}>
          {shelfQuery.error?.message || "Loading shelf zone…"}
        </Notice>
      </>
    );
  const reading = selected || shelf.current;
  const image =
    overlay && reading?.overlay
      ? reading.overlay
      : reading?.input || shelf.latest_attempt?.input || shelf.reference;
  const settings = reading?.snapshot.settings || shelf.settings;
  return (
    <>
      <Link className="back-link" href="/">
        <ArrowLeft size={16} />
        Shelf overview
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {shelf.identifier} <span> / </span> {shelf.category || "Shelf zone"}
          </p>
          <h1>{shelf.name}</h1>
          <p className="muted location">
            <MapPin size={15} />
            {shelf.location}
            {shelf.demo && (
              <span className="inline-demo">Synthetic demo images</span>
            )}
          </p>
        </div>
        <div className="actions">
          <button className="button secondary" onClick={() => setSetup(true)}>
            <SlidersHorizontal size={16} />
            {shelf.reference ? "Calibration" : "Set up zone"}
          </button>
          <button
            className="button"
            disabled={!shelf.reference}
            onClick={() => setUpload(true)}
          >
            <Upload size={17} />
            Upload image
          </button>
        </div>
      </div>
      <nav className="detail-nav" aria-label="Shelf sections">
        <a href="#check">Current check</a>
        <a href="#restocking">Restocking</a>
        <a href="#placement">Product placement</a>
        <a href="#history">Check history</a>
      </nav>
      {!shelf.reference && (
        <Notice>
          This zone needs setup. Upload an empty reference and select its
          display area to begin.
        </Notice>
      )}
      {shelf.last_error && (
        <Notice error>
          <strong>Latest attempt: {date(shelf.last_attempt_at)}</strong>
          <br />
          {shelf.last_error}
          {shelf.current && (
            <p>
              Previous valid reading remains visible, checked{" "}
              {date(shelf.current.created_at)}.
            </p>
          )}
        </Notice>
      )}
      {selected && (
        <Notice>
          Viewing historical analysis from {date(selected.created_at)},
          calibration v{selected.calibration_version}.{" "}
          <button className="text-button" onClick={() => setSelected(null)}>
            Return to current reading
          </button>
        </Notice>
      )}
      <div className="detail-grid" id="check">
        <section className="panel image-panel">
          <div className="section-heading">
            <h2>
              {selected ? "Historical shelf check" : "Current shelf check"}
            </h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={overlay}
                disabled={!reading?.overlay}
                onChange={(e) => setOverlay(e.target.checked)}
              />
              Detection overlay
            </label>
          </div>
          {image ? (
            <img
              className="detail-image"
              src={image.url}
              alt={
                overlay
                  ? "Detected occupied area and selected ROI"
                  : "Shelf zone photograph"
              }
            />
          ) : (
            <div className="image-placeholder large">No shelf image yet</div>
          )}
          <div className="image-caption">
            <Clock3 size={14} />
            {reading
              ? `Checked ${date(reading.created_at)}`
              : "No valid check for this calibration"}
            <span>
              Calibration v
              {reading?.calibration_version || shelf.calibration_version}
            </span>
          </div>
        </section>
        <section className="panel reading-panel">
          <p className="eyebrow">VISIBLE SHELF COVERAGE</p>
          <Status
            status={reading?.classification || reading?.outcome || shelf.status}
          />
          <div className="big-number">{percent(reading?.occupancy_ratio)}</div>
          <p className="muted">Estimated occupied area</p>
          <div className="meter tall">
            <div
              className={`fill-${reading?.classification?.toLowerCase()}`}
              style={{ width: `${(reading?.occupancy_ratio || 0) * 100}%` }}
            />
          </div>
          <p className="reading-explanation">
            {reading?.classification
              ? `Estimated occupied area is ${percent(reading.occupancy_ratio)}; Low is ${settings.empty_threshold * 100}% to below ${settings.full_threshold * 100}%. Full starts at ${settings.full_threshold * 100}%.`
              : reading?.warnings.join(" ") ||
                "Save calibration, then upload a current image to get a reading."}
          </p>
          <small className="muted">
            Full means sufficient visible coverage for this demo. This does not
            measure product counts or hidden stock.
          </small>
        </section>
      </div>
      <div className="detail-grid secondary-grid">
        <section className="panel" id="restocking">
          <div className="section-heading">
            <h2>
              <PackageCheck size={18} />
              Restocking task
            </h2>
            {shelf.active_alert && (
              <span className="workflow-state">{shelf.active_alert.state}</span>
            )}
          </div>
          <ol className="workflow-steps" aria-label="Restocking progress">
            <li
              className={
                shelf.active_alert || shelf.awaiting_verification ? "done" : ""
              }
            >
              01 · Identify
            </li>
            <li
              className={
                shelf.awaiting_verification
                  ? "done"
                  : shelf.active_alert
                    ? "current"
                    : ""
              }
            >
              02 · Restock
            </li>
            <li className={shelf.awaiting_verification ? "current" : ""}>
              03 · Verify photo
            </li>
          </ol>
          {shelf.awaiting_verification ? (
            <Notice>
              <strong>Awaiting verification</strong>
              <p>
                Staff reported restocked {date(shelf.reported_restocked_at)}.
                The measured status remains {shelf.status}. Upload a new photo
                to verify.
              </p>
              <button className="button" onClick={() => setUpload(true)}>
                <Upload size={16} />
                Upload verification photo
              </button>
            </Notice>
          ) : shelf.active_alert ? (
            <>
              <div className="task-summary">
                <Status status={shelf.active_alert.severity} />
                <strong>Restock this zone</strong>
              </div>
              <p className="muted">
                Detected {date(shelf.active_alert.first_detected_at)}
                <br />
                Last detected {date(shelf.active_alert.last_detected_at)}
              </p>
              <div className="actions">
                <button
                  className="button secondary"
                  disabled={
                    action.isPending ||
                    shelf.active_alert.state === "Acknowledged"
                  }
                  onClick={() =>
                    action.mutate({
                      alertId: shelf.active_alert!.id,
                      action: "acknowledge",
                    })
                  }
                >
                  <Check size={16} />
                  {shelf.active_alert.state === "Acknowledged"
                    ? "Acknowledged"
                    : "Acknowledge"}
                </button>
                <button
                  className="button"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      alertId: shelf.active_alert!.id,
                      action: "report_restocked",
                    })
                  }
                >
                  <PackageCheck size={16} />
                  Report restocked
                </button>
              </div>
              <p className="small-text muted">
                Reporting restocked closes the task. A new image is required to
                verify the shelf.
              </p>
            </>
          ) : (
            <p className="muted">
              No active restocking task. Valid Low or Empty checks will create
              one.
            </p>
          )}
          {action.isError && <Notice error>{action.error.message}</Notice>}
          {action.isSuccess && <Notice>Staff action saved.</Notice>}
        </section>
        {shelf.demo && (
          <section id="demo" className="panel demo-panel">
            <div className="section-heading">
              <h2>
                <Play size={18} />
                Built-in demonstration
              </h2>
              <span className="inline-demo">Synthetic</span>
            </div>
            <p className="muted">
              Run a local sample through the same detector and saved alert
              workflow as an uploaded image.
            </p>
            <label>
              Sample image
              <select
                value={sample}
                onChange={(e) => {
                  setSample(e.target.value);
                  demo.reset();
                }}
              >
                <option value="full">Full coverage sample</option>
                <option value="low">Low coverage sample</option>
                <option value="empty">Empty shelf sample</option>
                <option value="mismatched">Mismatched framing sample</option>
                <option value="misplaced">Misplaced packaging sample</option>
              </select>
            </label>
            <button
              className="button"
              disabled={demo.isPending}
              onClick={() => {
                setSelected(null);
                demo.mutate();
              }}
            >
              <Play size={16} />
              {demo.isPending ? "Processing sample…" : "Run demo sample"}
            </button>
            {demo.isError && <Notice error>{demo.error.message}</Notice>}
            {demo.data && (
              <Notice>
                {demo.data.classification
                  ? `${demo.data.classification} · ${percent(demo.data.occupancy_ratio)} estimated occupied area. Saved.`
                  : `${demo.data.outcome}: ${demo.data.warnings.join(" ")}`}
                {demo.data.placement_result &&
                  ` ${demo.data.placement_result.status}.`}
                {sample === "misplaced" &&
                  !demo.data.placement_result &&
                  " Enable placement review with the correct demo layout to compare packaging."}
              </Notice>
            )}
          </section>
        )}
      </div>
      <section className="panel placement-panel" id="placement">
        <div className="section-heading">
          <h2>Product placement</h2>
          <button
            className="button secondary small"
            disabled={!shelf.reference}
            onClick={() => setPlacementSetup(true)}
          >
            {shelf.placement_reference
              ? "Expected layout"
              : "Enable placement review"}
          </button>
        </div>
        {reading?.placement_result ? (
          <>
            <Status status={reading.placement_result.status} />
            <p>{reading.placement_result.reason}</p>
            <p className="muted">
              Appearance mismatch:{" "}
              {percent(reading.placement_result.mismatch_ratio)} · Compared
              area: {percent(reading.placement_result.compared_ratio)} of the
              selected region.
            </p>
            {reading.placement_result.status === "Placement review" && (
              <p>
                Turn on Detection overlay to inspect the orange differences.
              </p>
            )}
            {reading.placement_reference && (
              <details>
                <summary>Expected layout for this check</summary>
                <img
                  className="upload-preview"
                  src={reading.placement_reference.url}
                  alt="Expected shelf layout for this analysis"
                />
              </details>
            )}
          </>
        ) : (
          <p className="muted">
            {shelf.placement_reference
              ? "Upload a new photo to check product appearance against the saved layout."
              : "Save a correctly arranged shelf photo to flag possible misplaced items in a fixed layout."}
          </p>
        )}
        <p className="small-text muted">
          Lighting, packaging changes, and camera movement can also cause
          differences. Placement review is separate from stock status and
          restocking tasks.
        </p>
      </section>
      <section className="panel history-panel" id="history">
        <div className="section-heading">
          <h2>Recent checks</h2>
          <span className="muted">Newest first · select to inspect</span>
        </div>
        {history.isError && <Notice error>{history.error.message}</Notice>}
        {history.data?.length === 0 && (
          <p className="muted">No analyses yet.</p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Checked</th>
                <th>Result</th>
                <th>Occupied area</th>
                <th>Calibration</th>
                <th>Placement</th>
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.map((a) => (
                <tr key={a.id} aria-selected={selected?.id === a.id}>
                  <td>{date(a.created_at)}</td>
                  <td>
                    <Status status={a.classification || a.outcome} />
                  </td>
                  <td>{percent(a.occupancy_ratio)}</td>
                  <td>v{a.calibration_version}</td>
                  <td>{a.placement_result?.status || "Not configured"}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(a);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      View check
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="panel measurement">
        <summary>How this was measured</summary>
        <p>
          We compare this photo with the empty reference inside one selected
          rectangle. Color differences form a foreground mask; small isolated
          patches are removed. Occupied area is foreground pixels divided by all
          ROI pixels.
        </p>
        <div className="debug-grid">
          {(reading
            ? [reading.reference, reading.mask]
            : [shelf.reference]
          ).map(
            (asset, index) =>
              asset && (
                <figure key={asset.id}>
                  <img
                    src={asset.url}
                    alt={
                      index === 0 ? "Empty reference" : "Binary foreground mask"
                    }
                  />
                  <figcaption>
                    {index === 0
                      ? "Empty reference"
                      : "Measured foreground mask"}
                  </figcaption>
                </figure>
              ),
          )}
        </div>
        <dl className="measurement-list">
          <dt>Algorithm</dt>
          <dd>{reading?.algorithm_version || "No analysis yet"}</dd>
          <dt>Processing duration</dt>
          <dd>{reading ? `${reading.duration_ms.toFixed(1)} ms` : "—"}</dd>
          <dt>Warnings</dt>
          <dd>{reading?.warnings.join("; ") || "None recorded"}</dd>
          <dt>ROI & settings snapshot</dt>
          <dd>
            <pre>
              {JSON.stringify(
                reading?.snapshot || {
                  roi: shelf.roi,
                  settings: shelf.settings,
                },
                null,
                2,
              )}
            </pre>
          </dd>
        </dl>
        <p className="muted">
          Shadows, reflections, lighting changes, camera movement, similar
          packaging colors, occlusion, and hidden depth can affect this
          heuristic. Matching image dimensions do not guarantee a matching
          camera angle. It cannot identify products in arbitrary photographs.
        </p>
      </details>
      <details className="panel">
        <summary>Restocking task history</summary>
        {alerts.isError && <Notice error>{alerts.error.message}</Notice>}
        {alerts.data
          ?.filter((a) => a.shelf_id === id)
          .map((a) => (
            <div className="alert-history" key={a.id}>
              <Status status={a.severity} />
              <span>
                {a.state} · {a.resolution_reason || "Restock"}
                <small>
                  {date(a.first_detected_at)} →{" "}
                  {date(a.resolved_at || a.last_detected_at)}
                </small>
              </span>
            </div>
          ))}
      </details>
      {upload && <UploadModal shelf={shelf} close={() => setUpload(false)} />}
      {setup && (
        <Modal title="Calibrate shelf zone" close={() => setSetup(false)}>
          <CalibrationForm shelf={shelf} done={() => setSetup(false)} />
        </Modal>
      )}
      {placementSetup && (
        <Modal
          title="Set expected shelf layout"
          close={() => setPlacementSetup(false)}
        >
          <PlacementForm shelf={shelf} close={() => setPlacementSetup(false)} />
        </Modal>
      )}
    </>
  );
}
