from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .detector import DetectorConfig, ROI
from .placement import PlacementConfig, PlacementResult


class ShelfCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    identifier: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    location: str = Field(min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=120)


class Calibration(BaseModel):
    roi: ROI
    settings: DetectorConfig = Field(default_factory=DetectorConfig)


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    shelf_id: str
    mime_type: str
    width: int
    height: int
    file_size: int
    role: str
    created_at: datetime
    url: str


class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    shelf_id: str
    outcome: str
    classification: str | None
    occupancy_ratio: float | None
    warnings: list[str]
    algorithm_version: str
    calibration_version: int
    snapshot: dict
    duration_ms: float
    created_at: datetime
    input: AssetOut
    reference: AssetOut | None
    overlay: AssetOut | None
    mask: AssetOut | None
    placement_reference: AssetOut | None
    placement_result: PlacementResult | None


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    shelf_id: str
    analysis_id: str
    severity: str
    state: str
    first_detected_at: datetime
    last_detected_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    resolution_reason: str | None
    identifier: str
    location: str
    occupancy_ratio: float
    recommended_action: str = "Restock"


class ShelfOut(BaseModel):
    id: str
    identifier: str
    name: str
    location: str
    category: str | None
    demo: bool
    calibration_version: int
    roi: ROI | None
    settings: DetectorConfig
    reference: AssetOut | None
    placement_reference: AssetOut | None
    placement_settings: PlacementConfig
    status: str
    current: AnalysisOut | None
    latest_attempt: AnalysisOut | None
    active_alert: AlertOut | None
    awaiting_verification: bool
    reported_restocked_at: datetime | None
    last_error: str | None
    last_attempt_at: datetime | None


class StoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    location: str | None
    demo: bool


class DashboardOut(BaseModel):
    total: int
    full: int
    low: int
    empty: int
    unavailable: int
    placement_review: int
    attention: list[ShelfOut]


class Action(BaseModel):
    action: Literal["acknowledge", "report_restocked"]


class DemoSample(BaseModel):
    sample: Literal["full", "low", "empty", "mismatched", "misplaced"]


class DemoPlacement(BaseModel):
    calibration_version: int = Field(ge=0)


class HealthOut(BaseModel):
    api: str
    database: str
