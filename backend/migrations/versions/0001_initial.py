"""Initial PostgreSQL schema. Deliberately frozen, independent of ORM changes."""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE stores (
      id varchar(36) PRIMARY KEY, name varchar(120) NOT NULL, location varchar(160),
      demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL);
    CREATE UNIQUE INDEX one_demo_store ON stores (demo) WHERE demo;
    CREATE TABLE shelves (
      id varchar(36) PRIMARY KEY, store_id varchar(36) NOT NULL REFERENCES stores(id),
      identifier varchar(40) NOT NULL, name varchar(120) NOT NULL, location varchar(120) NOT NULL,
      category varchar(120), reference_image_id varchar(36), roi jsonb, settings jsonb NOT NULL,
      calibration_version integer NOT NULL CHECK (calibration_version >= 0),
      latest_valid_analysis_id varchar(36), last_error text, last_attempt_at timestamptz,
      reported_restocked_at timestamptz, demo boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
      UNIQUE (store_id, identifier));
    CREATE TABLE image_assets (
      id varchar(36) PRIMARY KEY, shelf_id varchar(36) NOT NULL REFERENCES shelves(id),
      storage_key varchar(200) NOT NULL UNIQUE, mime_type varchar(40) NOT NULL,
      width integer NOT NULL CHECK(width > 0), height integer NOT NULL CHECK(height > 0),
      file_size integer NOT NULL CHECK(file_size > 0),
      role varchar(20) NOT NULL CHECK(role IN ('Reference','Input','Overlay','Mask')),
      demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL,
      UNIQUE(id, shelf_id));
    CREATE TABLE analyses (
      id varchar(36) PRIMARY KEY, shelf_id varchar(36) NOT NULL REFERENCES shelves(id),
      input_image_id varchar(36) NOT NULL, reference_image_id varchar(36),
      overlay_image_id varchar(36), mask_image_id varchar(36),
      outcome varchar(30) NOT NULL CHECK(outcome IN ('Valid','Review required','Needs setup')),
      classification varchar(10) CHECK(classification IN ('Full','Low','Empty')),
      occupancy_ratio double precision CHECK(occupancy_ratio >= 0 AND occupancy_ratio <= 1),
      warnings jsonb NOT NULL, algorithm_version varchar(60) NOT NULL,
      calibration_version integer NOT NULL, snapshot jsonb NOT NULL,
      duration_ms double precision NOT NULL CHECK(duration_ms >= 0), created_at timestamptz NOT NULL,
      CHECK ((outcome = 'Valid' AND classification IS NOT NULL AND occupancy_ratio IS NOT NULL
        AND reference_image_id IS NOT NULL AND overlay_image_id IS NOT NULL AND mask_image_id IS NOT NULL)
        OR (outcome <> 'Valid' AND classification IS NULL AND occupancy_ratio IS NULL)),
      UNIQUE(id, shelf_id),
      FOREIGN KEY(input_image_id, shelf_id) REFERENCES image_assets(id, shelf_id),
      FOREIGN KEY(reference_image_id, shelf_id) REFERENCES image_assets(id, shelf_id),
      FOREIGN KEY(overlay_image_id, shelf_id) REFERENCES image_assets(id, shelf_id),
      FOREIGN KEY(mask_image_id, shelf_id) REFERENCES image_assets(id, shelf_id));
    ALTER TABLE shelves ADD CONSTRAINT shelf_reference_ownership
      FOREIGN KEY(reference_image_id, id) REFERENCES image_assets(id, shelf_id);
    ALTER TABLE shelves ADD CONSTRAINT shelf_analysis_ownership
      FOREIGN KEY(latest_valid_analysis_id, id) REFERENCES analyses(id, shelf_id);
    CREATE TABLE alerts (
      id varchar(36) PRIMARY KEY, shelf_id varchar(36) NOT NULL REFERENCES shelves(id),
      analysis_id varchar(36) NOT NULL, severity varchar(10) NOT NULL CHECK(severity IN ('Low','Empty')),
      state varchar(20) NOT NULL CHECK(state IN ('Open','Acknowledged','Resolved')),
      first_detected_at timestamptz NOT NULL, last_detected_at timestamptz NOT NULL,
      acknowledged_at timestamptz, resolved_at timestamptz, resolution_reason varchar(100),
      FOREIGN KEY(analysis_id, shelf_id) REFERENCES analyses(id, shelf_id));
    CREATE UNIQUE INDEX one_active_alert_per_shelf ON alerts(shelf_id)
      WHERE state IN ('Open', 'Acknowledged');
    CREATE INDEX recent_analyses ON analyses(shelf_id, created_at DESC);
    CREATE INDEX recent_alerts ON alerts(shelf_id, last_detected_at DESC);
    CREATE INDEX shelf_images ON image_assets(shelf_id);
    """)


def downgrade():
    op.execute("""
    ALTER TABLE shelves DROP CONSTRAINT shelf_reference_ownership;
    ALTER TABLE shelves DROP CONSTRAINT shelf_analysis_ownership;
    DROP TABLE alerts; DROP TABLE analyses; DROP TABLE image_assets;
    DROP TABLE shelves; DROP TABLE stores;
    """)
