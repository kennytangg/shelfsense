"""Explicit local image ingestion. Source images are never deleted or renamed."""

import hashlib
import logging
import time
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select

from . import db, service
from .detector import MAX_BYTES, ImageError, decode
from .models import IngestionReceipt, Shelf

logger = logging.getLogger(__name__)


def signature(path: Path):
    stat = path.stat()
    return stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns


class FolderMonitor:
    def __init__(self, folder):
        self.folder = Path(folder).expanduser().resolve(strict=True)
        if not self.folder.is_dir():
            raise ValueError("Monitoring folder must be an existing directory.")
        media = db.MEDIA_ROOT.resolve()
        if self.folder == media or media in self.folder.parents or self.folder in media.parents:
            raise ValueError("Use a monitoring folder separate from managed media.")
        self.observed = {}
        self.finished = {}
        self.errors = {}

    def scan(self):
        """A file must be unchanged across two scans before attempting ingestion."""
        with db.Session() as session:
            store = service.active_store(session)
            shelves = {
                shelf.identifier: (shelf.id, shelf.calibration_version)
                for shelf in session.scalars(select(Shelf).where(Shelf.store_id == store.id))
            }
        paths = []
        for folder in sorted(self.folder.iterdir()):
            if folder.is_symlink() or not folder.is_dir():
                continue
            for path in folder.iterdir():
                if path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
                    if not path.is_symlink() and path.is_file():
                        paths.append(path)
        present = set(paths)
        self.observed = {p: s for p, s in self.observed.items() if p in present}
        self.finished = {p: s for p, s in self.finished.items() if p in present}
        self.errors = {p: s for p, s in self.errors.items() if p in present}
        saved = []
        # Process oldest stable arrivals first within a scan.
        for path in sorted(paths, key=lambda p: (p.stat().st_mtime_ns, str(p))):
            try:
                current = signature(path)
                previous = self.observed.get(path)
                self.observed[path] = current
                if previous != current:
                    continue
                target = shelves.get(path.parent.name)
                if not target:
                    raise ValueError("Unknown shelf identifier; create the shelf first.")
                shelf_id, version = target
                token = (current, shelf_id, version)
                if self.finished.get(path) == token:
                    continue
                with path.open("rb") as stream:
                    data = stream.read(MAX_BYTES + 1)
                if signature(path) != current:
                    continue
                digest = hashlib.sha256(data).hexdigest()
                with db.Session() as session:
                    receipt = session.get(IngestionReceipt, (shelf_id, version, digest))
                    if receipt:
                        self.finished[path] = token
                        continue
                try:
                    image = decode(data)
                except ImageError as exc:
                    service.record_error(shelf_id, str(exc))
                    self.finished[path] = token
                    raise
                analysis_id = service.analyze(
                    shelf_id, image, ingestion_digest=digest, expected_version=version
                )
                self.finished[path] = token
                self.errors.pop(path, None)
                saved.append(analysis_id)
                logger.info("Saved %r -> analysis %s", str(path), analysis_id)
            except (ImageError, ValueError, OSError, HTTPException) as exc:
                error = (self.observed.get(path), type(exc).__name__)
                if self.errors.get(path) != error:
                    reason = exc.detail if isinstance(exc, HTTPException) else str(exc)
                    logger.warning("Cannot ingest %r: %s", str(path), reason)
                    self.errors[path] = error
            except Exception as exc:
                # Do not emit connection strings or raw database statements.
                error = (self.observed.get(path), type(exc).__name__)
                if self.errors.get(path) != error:
                    logger.error(
                        "Cannot ingest %r (%s); will retry.", str(path), type(exc).__name__
                    )
                    self.errors[path] = error
        return saved


def watch(folder, interval=2):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    monitor = FolderMonitor(folder)
    logger.info("Watching %s; Ctrl+C stops monitoring. Source images are retained.", monitor.folder)
    unavailable = False
    try:
        while True:
            try:
                monitor.scan()
                unavailable = False
            except Exception as exc:
                if not unavailable:
                    logger.error("Monitoring unavailable (%s); will retry.", type(exc).__name__)
                unavailable = True
            time.sleep(interval)
    except KeyboardInterrupt:
        logger.info("Monitoring stopped.")
