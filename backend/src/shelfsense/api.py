import json
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError

from . import db, service
from .detector import ImageError, decode
from .fixtures import ROOT
from .models import Alert, Analysis, ImageAsset, Shelf
from .schemas import (
    Action,
    AlertOut,
    AnalysisOut,
    AssetOut,
    Calibration,
    DashboardOut,
    DemoSample,
    HealthOut,
    ShelfCreate,
    ShelfOut,
    StoreOut,
)

app = FastAPI(title="ShelfSense", version="0.1.0")
db.MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=db.MEDIA_ROOT), name="media")


@app.exception_handler(OperationalError)
def database_error(request, exc):
    return JSONResponse(
        status_code=503,
        content={"detail": "PostgreSQL is unavailable. Start the database and retry."},
    )


@app.exception_handler(IntegrityError)
def constraint_error(request, exc):
    return JSONResponse(
        status_code=409,
        content={
            "detail": "This change conflicts with an existing record. Check the shelf identifier and refresh."
        },
    )


@app.exception_handler(ImageError)
def image_error(request, exc):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/api/health", response_model=HealthOut)
def health():
    with db.Session() as session:
        session.execute(text("SELECT 1"))
    return {"api": "ready", "database": "ready"}


@app.get("/api/store", response_model=StoreOut)
def store():
    with db.Session() as session:
        return service.active_store(session)


@app.get("/api/shelves", response_model=list[ShelfOut])
def shelves(search: str = "", status: str = "", aisle: str = ""):
    with db.Session() as session:
        query = select(Shelf).where(Shelf.store_id == service.active_store(session).id)
        records = [service.shelf_out(session, s) for s in session.scalars(query)]
        records = [
            s
            for s in records
            if (not search or search.lower() in f"{s.identifier} {s.name}".lower())
            and (not status or s.status == status or status == "Unavailable" and s.current is None)
            and (not aisle or s.location == aisle)
        ]
        order = {
            "Empty": 0,
            "Low": 1,
            "Review required": 2,
            "Needs setup": 3,
            "Not checked": 4,
            "Full": 5,
        }
        return sorted(records, key=lambda s: (order[s.status], s.identifier))


@app.get("/api/dashboard", response_model=DashboardOut)
def dashboard():
    records = shelves()
    return DashboardOut(
        total=len(records),
        full=sum(s.status == "Full" for s in records),
        low=sum(s.status == "Low" for s in records),
        empty=sum(s.status == "Empty" for s in records),
        unavailable=sum(s.current is None for s in records),
        attention=[s for s in records if s.status in {"Low", "Empty"}],
    )


@app.post("/api/shelves", response_model=ShelfOut, status_code=201)
def create_shelf(payload: ShelfCreate):
    with db.Session.begin() as session:
        shelf = Shelf(**payload.model_dump(), store_id=service.active_store(session).id)
        session.add(shelf)
        session.flush()
        return service.shelf_out(session, shelf)


@app.get("/api/shelves/{shelf_id}", response_model=ShelfOut)
def shelf_detail(shelf_id: str):
    with db.Session() as session:
        return service.shelf_out(session, service.get_shelf(session, shelf_id))


@app.post("/api/shelves/{shelf_id}/calibration", response_model=ShelfOut)
def calibration(shelf_id: str, file: Annotated[UploadFile, File()], config: Annotated[str, Form()]):
    try:
        payload = Calibration.model_validate_json(config)
    except ValidationError as exc:
        raise HTTPException(
            422, "Invalid calibration: " + "; ".join(e["msg"] for e in exc.errors())
        ) from exc
    image = service.decode_upload(shelf_id, file)
    service.calibrate(shelf_id, image, payload)
    return shelf_detail(shelf_id)


@app.post("/api/shelves/{shelf_id}/analyses", response_model=AnalysisOut, status_code=201)
def upload(shelf_id: str, file: Annotated[UploadFile, File()]):
    analysis_id = service.analyze(shelf_id, service.decode_upload(shelf_id, file))
    with db.Session() as session:
        return service.analysis_out(session, session.get(Analysis, analysis_id))


@app.get("/api/shelves/{shelf_id}/analyses", response_model=list[AnalysisOut])
def history(shelf_id: str, limit: int = Query(default=50, ge=1, le=200)):
    with db.Session() as session:
        service.get_shelf(session, shelf_id)
        records = session.scalars(
            select(Analysis)
            .where(Analysis.shelf_id == shelf_id)
            .order_by(Analysis.created_at.desc())
            .limit(limit)
        )
        return [service.analysis_out(session, a) for a in records]


@app.get("/api/images/{asset_id}", response_model=AssetOut)
def image_metadata(asset_id: str):
    with db.Session() as session:
        asset = session.get(ImageAsset, asset_id)
        if not asset:
            raise HTTPException(404, "Image not found.")
        service.get_shelf(session, asset.shelf_id)
        return service.asset_out(session, asset.id)


@app.get("/api/alerts", response_model=list[AlertOut])
def alerts(state: str | None = None):
    with db.Session() as session:
        query = (
            select(Alert)
            .join(Shelf, Alert.shelf_id == Shelf.id)
            .where(Shelf.store_id == service.active_store(session).id)
            .order_by(Alert.last_detected_at.desc())
        )
        if state:
            query = query.where(Alert.state == state)
        return [service.alert_out(session, a) for a in session.scalars(query)]


@app.patch("/api/alerts/{alert_id}", response_model=AlertOut)
def alert_action(alert_id: str, payload: Action):
    service.staff_action(alert_id, payload.action)
    with db.Session() as session:
        return service.alert_out(session, session.get(Alert, alert_id))


@app.post("/api/shelves/{shelf_id}/demo-analysis", response_model=AnalysisOut, status_code=201)
def demo_analysis(shelf_id: str, payload: DemoSample):
    with db.Session() as session:
        shelf = service.get_shelf(session, shelf_id)
        if not shelf.demo:
            raise HTTPException(
                400, "Built-in samples are available only for synthetic demo shelves."
            )
        identifier = shelf.identifier
    manifest_path = ROOT / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(503, "Demo images are missing. Run the demo seed command.")
    manifest = json.loads(manifest_path.read_text())
    entry = next((s for s in manifest["shelves"] if s["identifier"] == identifier), None)
    if not entry:
        raise HTTPException(404, "No bundled sample for this shelf.")
    # Request contains an enum, never a path. Expected labels are not passed to the detector.
    image = decode((ROOT / entry["samples"][payload.sample]["file"]).read_bytes())
    analysis_id = service.analyze(shelf_id, image, demo=True)
    with db.Session() as session:
        return service.analysis_out(session, session.get(Analysis, analysis_id))
