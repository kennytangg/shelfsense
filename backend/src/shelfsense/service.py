"""Short, locked publication transactions after image processing has completed."""

from pathlib import Path

import numpy as np
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import select

from . import db
from .detector import (
    ALGORITHM_VERSION,
    MAX_BYTES,
    Detection,
    DetectorConfig,
    ImageError,
    ROI,
    decode,
    detect,
)
from .models import Alert, Analysis, ImageAsset, Shelf, Store, now, uid
from .schemas import AlertOut, AnalysisOut, AssetOut, Calibration, ShelfOut


def active_store(session):
    store = session.scalar(select(Store).where(Store.demo.is_(True)))
    if not store:
        raise HTTPException(503, "Demo store is not initialized. Run the demo seed command.")
    return store


def get_shelf(session, shelf_id, lock=False):
    query = select(Shelf).where(Shelf.id == shelf_id, Shelf.store_id == active_store(session).id)
    shelf = session.scalar(query.with_for_update() if lock else query)
    if not shelf:
        raise HTTPException(404, "Shelf zone not found.")
    return shelf


def asset_out(session, asset_id):
    if not asset_id:
        return None
    asset = session.get(ImageAsset, asset_id)
    return AssetOut(
        **{c.name: getattr(asset, c.name) for c in asset.__table__.columns},
        url=f"/media/{asset.storage_key}",
    )


def analysis_out(session, analysis):
    if not analysis:
        return None
    data = {c.name: getattr(analysis, c.name) for c in analysis.__table__.columns}
    return AnalysisOut(
        **data,
        input=asset_out(session, analysis.input_image_id),
        reference=asset_out(session, analysis.reference_image_id),
        overlay=asset_out(session, analysis.overlay_image_id),
        mask=asset_out(session, analysis.mask_image_id),
    )


def active_alert(session, shelf_id):
    return session.scalar(
        select(Alert).where(Alert.shelf_id == shelf_id, Alert.state.in_(["Open", "Acknowledged"]))
    )


def alert_out(session, alert):
    if not alert:
        return None
    shelf = session.get(Shelf, alert.shelf_id)
    analysis = session.get(Analysis, alert.analysis_id)
    return AlertOut(
        **{c.name: getattr(alert, c.name) for c in alert.__table__.columns},
        identifier=shelf.identifier,
        location=shelf.location,
        occupancy_ratio=analysis.occupancy_ratio,
    )


def shelf_out(session, shelf):
    current = (
        session.get(Analysis, shelf.latest_valid_analysis_id)
        if shelf.latest_valid_analysis_id
        else None
    )
    if current and current.calibration_version != shelf.calibration_version:
        current = None
    latest = session.scalar(
        select(Analysis)
        .where(Analysis.shelf_id == shelf.id)
        .order_by(Analysis.created_at.desc())
        .limit(1)
    )
    status = (
        current.classification
        if current
        else "Needs setup"
        if not shelf.reference_image_id
        else "Review required"
        if shelf.last_error
        else "Not checked"
    )
    return ShelfOut(
        id=shelf.id,
        identifier=shelf.identifier,
        name=shelf.name,
        location=shelf.location,
        category=shelf.category,
        demo=shelf.demo,
        calibration_version=shelf.calibration_version,
        roi=shelf.roi,
        settings=DetectorConfig(**shelf.settings),
        reference=asset_out(session, shelf.reference_image_id),
        status=status,
        current=analysis_out(session, current),
        latest_attempt=analysis_out(session, latest),
        active_alert=alert_out(session, active_alert(session, shelf.id)),
        awaiting_verification=shelf.reported_restocked_at is not None,
        reported_restocked_at=shelf.reported_restocked_at,
        last_error=shelf.last_error,
        last_attempt_at=shelf.last_attempt_at,
    )


def write_asset(shelf_id, array: np.ndarray, role: str, demo: bool, paths: list[Path]):
    db.MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    key = f"{uid()}.png"
    path = db.MEDIA_ROOT / key
    paths.append(path)
    Image.fromarray(array).save(path, format="PNG")
    return ImageAsset(
        id=uid(),
        shelf_id=shelf_id,
        storage_key=key,
        mime_type="image/png",
        width=array.shape[1],
        height=array.shape[0],
        file_size=path.stat().st_size,
        role=role,
        demo=demo,
    )


def cleanup(paths):
    for path in paths:
        path.unlink(missing_ok=True)


def record_error(shelf_id, message):
    with db.Session.begin() as session:
        shelf = get_shelf(session, shelf_id, lock=True)
        shelf.last_error, shelf.last_attempt_at = message, now()


def decode_upload(shelf_id, file):
    with db.Session() as session:
        get_shelf(session, shelf_id)
    try:
        return decode(file.file.read(MAX_BYTES + 1))
    except ImageError as exc:
        record_error(shelf_id, str(exc))
        raise HTTPException(413 if "10 MB" in str(exc) else 422, str(exc)) from exc


def calibrate(shelf_id, image, calibration: Calibration, demo=False):
    roi = calibration.roi
    if min(roi.width * image.shape[1], roi.height * image.shape[0]) < 32:
        raise HTTPException(422, "ROI must span at least 32 source pixels per side.")
    check = detect(image, image, roi, calibration.settings)
    if check.outcome != "Valid":
        raise HTTPException(422, "Reference unusable: " + "; ".join(check.warnings))
    paths = []
    try:
        asset = write_asset(shelf_id, image, "Reference", demo, paths)
        with db.Session.begin() as session:
            shelf = get_shelf(session, shelf_id, lock=True)
            session.add(asset)
            session.flush()
            shelf.reference_image_id = asset.id
            shelf.roi = roi.model_dump()
            shelf.settings = calibration.settings.model_dump()
            shelf.calibration_version += 1
            shelf.latest_valid_analysis_id = None
            shelf.last_error = None
            shelf.last_attempt_at = None
        return asset.id
    except Exception:
        cleanup(paths)
        raise


def update_alert(session, shelf, analysis):
    alert = active_alert(session, shelf.id)
    if analysis.classification == "Full":
        if alert:
            alert.state, alert.resolution_reason = "Resolved", "Verified full"
            alert.resolved_at = analysis.created_at
        shelf.reported_restocked_at = None
    else:
        if not alert:
            alert = Alert(
                shelf_id=shelf.id,
                analysis_id=analysis.id,
                severity=analysis.classification,
                first_detected_at=analysis.created_at,
            )
            session.add(alert)
        alert.analysis_id = analysis.id
        alert.severity = analysis.classification
        alert.last_detected_at = analysis.created_at
        shelf.reported_restocked_at = None


def analyze(shelf_id, image, demo=False, timestamp=None):
    # Snapshot and close read transaction before CPU / filesystem work.
    with db.Session() as session:
        shelf = get_shelf(session, shelf_id)
        version, roi_data, settings = shelf.calibration_version, shelf.roi, shelf.settings
        reference_id = shelf.reference_image_id
        reference_key = session.get(ImageAsset, reference_id).storage_key if reference_id else None
    if reference_key:
        # Managed references are normalized PNGs, already validated on ingestion.
        with Image.open(db.MEDIA_ROOT / reference_key) as ref:
            reference = np.array(ref.convert("RGB"))
        result = detect(reference, image, ROI(**roi_data), DetectorConfig(**settings))
    else:
        result = Detection(
            "Needs setup", None, None, ["Upload an empty reference and select an ROI first."], 0
        )
    paths = []
    try:
        input_asset = write_asset(shelf_id, image, "Input", demo, paths)
        overlay = (
            write_asset(shelf_id, result.overlay, "Overlay", demo, paths)
            if result.overlay is not None
            else None
        )
        mask = (
            write_asset(shelf_id, result.mask, "Mask", demo, paths)
            if result.mask is not None
            else None
        )
        with db.Session.begin() as session:
            shelf = get_shelf(session, shelf_id, lock=True)
            if shelf.calibration_version != version:
                raise HTTPException(
                    409, "Calibration changed during processing. Submit a new image."
                )
            session.add_all([a for a in [input_asset, overlay, mask] if a is not None])
            session.flush()
            analysis = Analysis(
                id=uid(),
                shelf_id=shelf.id,
                input_image_id=input_asset.id,
                reference_image_id=reference_id,
                overlay_image_id=overlay.id if overlay else None,
                mask_image_id=mask.id if mask else None,
                outcome=result.outcome,
                classification=result.classification,
                occupancy_ratio=result.occupancy_ratio,
                warnings=result.warnings,
                algorithm_version=ALGORITHM_VERSION,
                calibration_version=version,
                snapshot={"roi": roi_data, "settings": settings},
                duration_ms=result.duration_ms,
                created_at=timestamp or now(),
            )
            session.add(analysis)
            session.flush()
            shelf.last_attempt_at = analysis.created_at
            shelf.last_error = "; ".join(result.warnings) or None
            if result.outcome == "Valid":
                shelf.latest_valid_analysis_id = analysis.id
                update_alert(session, shelf, analysis)
        return analysis.id
    except Exception:
        cleanup(paths)
        raise


def staff_action(alert_id, action):
    with db.Session.begin() as session:
        alert = session.get(Alert, alert_id)
        if not alert:
            raise HTTPException(404, "Alert not found.")
        shelf = get_shelf(session, alert.shelf_id, lock=True)
        session.refresh(alert)
        if alert.state == "Resolved":
            raise HTTPException(
                409, "This task is already closed. Refresh to see the current task."
            )
        if action == "acknowledge":
            alert.state = "Acknowledged"
            alert.acknowledged_at = alert.acknowledged_at or now()
        else:
            alert.state, alert.resolution_reason = "Resolved", "Staff reported restocked"
            alert.resolved_at = now()
            shelf.reported_restocked_at = alert.resolved_at
