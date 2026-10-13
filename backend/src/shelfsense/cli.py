import argparse
from datetime import timedelta

from sqlalchemy import delete, select, text

from . import db, service
from .detector import decode
from .fixtures import ROOT, generate
from .models import Alert, Analysis, ImageAsset, IngestionReceipt, Shelf, Store, now
from .schemas import Calibration


def seed():
    manifest = generate()
    with db.Session.begin() as session:
        session.execute(text("SELECT pg_advisory_xact_lock(762410)"))
        store = session.scalar(select(Store).where(Store.demo.is_(True)))
        if not store:
            store = Store(name="Greenway Market", location="University demo store", demo=True)
            session.add(store)
            session.flush()
        store_id = store.id
    for index, entry in enumerate(manifest["shelves"]):
        with db.Session.begin() as session:
            session.execute(text("SELECT pg_advisory_xact_lock(762410)"))
            existing = session.scalar(
                select(Shelf).where(
                    Shelf.store_id == store_id, Shelf.identifier == entry["identifier"]
                )
            )
            if existing:
                continue  # Never replace a user's calibration, photos, or workflow.
            shelf = Shelf(
                store_id=store_id,
                identifier=entry["identifier"],
                name=entry["name"],
                location=entry["location"],
                category="Groceries",
                demo=True,
            )
            session.add(shelf)
            session.flush()
            shelf_id = shelf.id
        service.calibrate(
            shelf_id,
            decode((ROOT / entry["reference"]).read_bytes()),
            Calibration(roi=entry["roi"]),
            demo=True,
        )
        variants = (
            ["full", "low", "empty", "full"]
            if index == 0
            else [["full", "low", "empty"][index % 3]]
        )
        for step, variant in enumerate(variants):
            service.analyze(
                shelf_id,
                decode((ROOT / entry["samples"][variant]["file"]).read_bytes()),
                demo=True,
                timestamp=now() - timedelta(minutes=20 * (len(variants) - step)),
            )
    print("Seed complete. Existing shelf records were left unchanged.")


def reset():
    paths = []
    with db.Session.begin() as session:
        session.execute(text("SELECT pg_advisory_xact_lock(762410)"))
        shelves = list(session.scalars(select(Shelf).where(Shelf.demo.is_(True)).with_for_update()))
        for shelf in shelves:
            # Protect demo shelves that now contain any user upload/reference.
            if session.scalar(
                select(ImageAsset.id)
                .where(ImageAsset.shelf_id == shelf.id, ImageAsset.demo.is_(False))
                .limit(1)
            ):
                print(f"Preserved {shelf.identifier}: contains user-owned images.")
                continue
            assets = list(
                session.scalars(select(ImageAsset).where(ImageAsset.shelf_id == shelf.id))
            )
            paths.extend(db.MEDIA_ROOT / asset.storage_key for asset in assets)
            shelf.reference_image_id = shelf.latest_valid_analysis_id = None
            shelf.placement_reference_image_id = None
            session.flush()
            session.execute(delete(IngestionReceipt).where(IngestionReceipt.shelf_id == shelf.id))
            session.execute(delete(Alert).where(Alert.shelf_id == shelf.id))
            session.execute(delete(Analysis).where(Analysis.shelf_id == shelf.id))
            session.execute(delete(ImageAsset).where(ImageAsset.shelf_id == shelf.id))
            session.delete(shelf)
    service.cleanup(paths)
    print("Reset only demo-owned shelves and their managed files; store and user data preserved.")


def main():
    parser = argparse.ArgumentParser(description="ShelfSense local demo utilities")
    parser.add_argument("command", choices=["fixtures", "seed", "reset-demo", "watch"])
    parser.add_argument("--yes", action="store_true", help="Confirm removal of demo-only records")
    parser.add_argument("--folder", help="Monitoring root containing shelf-identifier subfolders")
    parser.add_argument("--interval", type=float, default=2, help="Scan interval in seconds (>= 1)")
    args = parser.parse_args()
    if args.command == "fixtures":
        generate()
    elif args.command == "seed":
        seed()
    elif args.command == "watch":
        if not args.folder or not args.interval >= 1 or args.interval > 3600:
            parser.error("watch requires --folder and an interval between 1 and 3600 seconds")
        from .monitor import watch

        watch(args.folder, args.interval)
    elif args.yes:
        reset()
    else:
        parser.error("reset-demo requires --yes; user-owned shelf images are preserved")
