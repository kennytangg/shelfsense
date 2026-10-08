import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postgres, updateDatabaseUrl } from '../scripts/dev.mjs';

test('uses a dedicated PostgreSQL container and volume away from the shared port', () => {
  assert.equal(postgres.container, 'shelfsense-postgres');
  assert.equal(postgres.volume, 'shelfsense_pg');
  assert.equal(postgres.port, 5433);
  assert.equal(postgres.image, 'postgres:16-alpine');
});

test('updates database configuration while preserving media settings and comments', () => {
  assert.equal(updateDatabaseUrl('# local\nDATABASE_URL=old\nMEDIA_DIR=/tmp/media\n', 'new'), '# local\nDATABASE_URL=new\nMEDIA_DIR=/tmp/media\n');
  assert.equal(updateDatabaseUrl('', 'new'), '\nDATABASE_URL=new\n');
});
