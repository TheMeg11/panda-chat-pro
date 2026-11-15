/**
 * Type declarations for scripts/db-migrate.mjs (imported by src/lib/schema-heal
 * at boot to reuse the incremental migration statements).
 */
export declare const MIGRATIONS: string[];
export declare function applyMigrations(query: (statement: string) => Promise<unknown>): Promise<number>;
