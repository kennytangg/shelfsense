import "server-only";
import { query } from "./database";

/** Every migration a release expects; shared by scripts/migrate.ts and health. */
export const EXPECTED_MIGRATION_VERSIONS: readonly string[] = ["0001", "0002"];

export const missingMigrations = (
  recorded: readonly string[],
  expected: readonly string[] = EXPECTED_MIGRATION_VERSIONS,
): string[] => expected.filter((version) => !recorded.includes(version));

const UNDEFINED_TABLE = "42P01";

function errorCode(e: unknown): string | undefined {
  let cause = e as { code?: string; cause?: unknown } | undefined;
  while (cause && !cause.code && cause.cause)
    cause = cause.cause as typeof cause;
  return cause?.code;
}

/** One small query; an absent journal table means nothing is applied. */
export async function pendingMigrations(): Promise<string[]> {
  try {
    const rows = await query("SELECT version FROM shelfsense_migrations");
    return missingMigrations(rows.map((row) => String(row.version)));
  } catch (e) {
    if (errorCode(e) === UNDEFINED_TABLE)
      return [...EXPECTED_MIGRATION_VERSIONS];
    throw e;
  }
}
