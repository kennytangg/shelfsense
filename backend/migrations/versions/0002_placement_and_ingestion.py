"""Expected shelf appearance and transactional monitoring receipts."""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE image_assets DROP CONSTRAINT image_assets_role_check;
    ALTER TABLE image_assets ADD CONSTRAINT image_assets_role_check
      CHECK(role IN ('Reference','Input','Overlay','Mask','PlacementReference'));
    ALTER TABLE shelves ADD COLUMN placement_reference_image_id varchar(36);
    ALTER TABLE shelves ADD COLUMN placement_settings jsonb NOT NULL DEFAULT '{}';
    ALTER TABLE shelves ADD CONSTRAINT shelf_placement_ownership
      FOREIGN KEY(placement_reference_image_id, id) REFERENCES image_assets(id, shelf_id);
    ALTER TABLE analyses ADD COLUMN placement_reference_image_id varchar(36);
    ALTER TABLE analyses ADD COLUMN placement_result jsonb;
    ALTER TABLE analyses ADD CONSTRAINT analysis_placement_ownership
      FOREIGN KEY(placement_reference_image_id, shelf_id) REFERENCES image_assets(id, shelf_id);
    CREATE TABLE ingestion_receipts (
      shelf_id varchar(36) NOT NULL REFERENCES shelves(id),
      calibration_version integer NOT NULL CHECK(calibration_version >= 0),
      digest varchar(64) NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
      analysis_id varchar(36) NOT NULL,
      PRIMARY KEY(shelf_id, calibration_version, digest),
      FOREIGN KEY(analysis_id, shelf_id) REFERENCES analyses(id, shelf_id));
    """)


def downgrade():
    op.execute("""
    DROP TABLE ingestion_receipts;
    ALTER TABLE analyses DROP CONSTRAINT analysis_placement_ownership;
    ALTER TABLE analyses DROP COLUMN placement_result;
    ALTER TABLE analyses DROP COLUMN placement_reference_image_id;
    ALTER TABLE shelves DROP CONSTRAINT shelf_placement_ownership;
    ALTER TABLE shelves DROP COLUMN placement_settings;
    ALTER TABLE shelves DROP COLUMN placement_reference_image_id;
    UPDATE image_assets SET role = 'Reference' WHERE role = 'PlacementReference';
    ALTER TABLE image_assets DROP CONSTRAINT image_assets_role_check;
    ALTER TABLE image_assets ADD CONSTRAINT image_assets_role_check
      CHECK(role IN ('Reference','Input','Overlay','Mask'));
    """)
