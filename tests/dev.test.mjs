import { test, expect } from '@jest/globals';
import { postgres, updateDatabaseUrl } from '../scripts/dev.mjs';

test('uses a dedicated PostgreSQL container and volume away from the shared port', () => {
  expect(postgres.container).toBe('shelfsense-postgres');
  expect(postgres.volume).toBe('shelfsense_pg');
  expect(postgres.port).toBe(5433);
  expect(postgres.image).toBe('postgres:16-alpine');
});

test('updates database configuration while preserving media settings and comments', () => {
  expect(updateDatabaseUrl('# local\nDATABASE_URL=old\nMEDIA_DIR=/tmp/media\n', 'new')).toBe(
    '# local\nDATABASE_URL=new\nMEDIA_DIR=/tmp/media\n',
  );
  expect(updateDatabaseUrl('', 'new')).toBe('\nDATABASE_URL=new\n');
});
