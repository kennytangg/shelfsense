import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now():
    return datetime.now(timezone.utc)


def uid():
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Store(Base):
    __tablename__ = "stores"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    location: Mapped[str | None] = mapped_column(String(160))
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Shelf(Base):
    __tablename__ = "shelves"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id"))
    identifier: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(120))
    location: Mapped[str] = mapped_column(String(120))
    category: Mapped[str | None] = mapped_column(String(120))
    reference_image_id: Mapped[str | None] = mapped_column(String(36))
    placement_reference_image_id: Mapped[str | None] = mapped_column(String(36))
    placement_settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    roi: Mapped[dict | None] = mapped_column(JSONB)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    calibration_version: Mapped[int] = mapped_column(Integer, default=0)
    latest_valid_analysis_id: Mapped[str | None] = mapped_column(String(36))
    last_error: Mapped[str | None] = mapped_column(Text)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reported_restocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class ImageAsset(Base):
    __tablename__ = "image_assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    shelf_id: Mapped[str] = mapped_column(ForeignKey("shelves.id"))
    storage_key: Mapped[str] = mapped_column(String(200), unique=True)
    mime_type: Mapped[str] = mapped_column(String(40))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    file_size: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(20))
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Analysis(Base):
    __tablename__ = "analyses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    shelf_id: Mapped[str] = mapped_column(ForeignKey("shelves.id"))
    input_image_id: Mapped[str] = mapped_column(String(36))
    reference_image_id: Mapped[str | None] = mapped_column(String(36))
    placement_reference_image_id: Mapped[str | None] = mapped_column(String(36))
    placement_result: Mapped[dict | None] = mapped_column(JSONB)
    overlay_image_id: Mapped[str | None] = mapped_column(String(36))
    mask_image_id: Mapped[str | None] = mapped_column(String(36))
    outcome: Mapped[str] = mapped_column(String(30))
    classification: Mapped[str | None] = mapped_column(String(10))
    occupancy_ratio: Mapped[float | None] = mapped_column(Float)
    warnings: Mapped[list] = mapped_column(JSONB, default=list)
    algorithm_version: Mapped[str] = mapped_column(String(60))
    calibration_version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSONB)
    duration_ms: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    shelf_id: Mapped[str] = mapped_column(ForeignKey("shelves.id"))
    analysis_id: Mapped[str] = mapped_column(String(36))
    severity: Mapped[str] = mapped_column(String(10))
    state: Mapped[str] = mapped_column(String(20), default="Open")
    first_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_reason: Mapped[str | None] = mapped_column(String(100))


class IngestionReceipt(Base):
    __tablename__ = "ingestion_receipts"
    shelf_id: Mapped[str] = mapped_column(ForeignKey("shelves.id"), primary_key=True)
    calibration_version: Mapped[int] = mapped_column(Integer, primary_key=True)
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    analysis_id: Mapped[str] = mapped_column(String(36))
