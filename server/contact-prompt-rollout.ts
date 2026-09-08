import { emptyContactPromptDueAt } from "@shared/checkin-policy";

/**
 * Kept as a pure helper so rollout anchoring can be tested without connecting
 * to Supabase. Production startup uses the transaction's CURRENT_TIMESTAMP;
 * the persisted column and WHERE NULL predicate make subsequent starts no-ops.
 */
export function legacyC3PromptDueAt(
  rolloutStartedAt: Date,
  random: () => number = Math.random,
): Date {
  return emptyContactPromptDueAt(3, rolloutStartedAt, random);
}

export const LEGACY_C3_PROMPT_BACKFILL_SQL = `
  UPDATE contacts
  SET empty_last_contact_prompt_due_at =
    CURRENT_TIMESTAMP + (14 + FLOOR(RANDOM() * 17)) * INTERVAL '1 day'
  WHERE circle_level = 3
    AND NULLIF(BTRIM(last_contacted), '') IS NULL
    AND empty_last_contact_prompt_due_at IS NULL
`;

export const LEGACY_C1_C2_MISSING_CREATED_AT_BACKFILL_SQL = `
  UPDATE contacts
  SET empty_last_contact_prompt_due_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
  WHERE circle_level IN (1, 2)
    AND NULLIF(BTRIM(last_contacted), '') IS NULL
    AND created_at IS NULL
    AND empty_last_contact_prompt_due_at IS NULL
`;

type MigrationPool = {
  query(sql: string): Promise<unknown>;
  connect(): Promise<{
    query(sql: string): Promise<unknown>;
    release(): void;
  }>;
};

export async function migrateEmptyContactPromptDueDates(
  pool: MigrationPool,
  production: boolean,
): Promise<void> {
  await pool.query(
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS empty_last_contact_prompt_due_at TIMESTAMP`,
  );
  if (!production) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(LEGACY_C1_C2_MISSING_CREATED_AT_BACKFILL_SQL);
    await client.query(LEGACY_C3_PROMPT_BACKFILL_SQL);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}