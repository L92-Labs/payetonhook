import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/** Exercise real migrated constraints and transactions, adapting only D1 transport. */
export function migratedDeliveryDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const root = new URL("../migrations/", import.meta.url);
  for (const name of readdirSync(root)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(new URL(name, root), "utf8"));
  }
  class Statement {
    constructor(
      readonly sql: string,
      readonly values: SQLInputValue[] = [],
    ) {}
    bind(...values: SQLInputValue[]) {
      return new Statement(this.sql, values);
    }
    execute() {
      const results = sqlite
        .prepare(this.sql)
        .all(...this.values)
        .map((row) => ({ ...row }));
      const changes = Number(
        sqlite.prepare("SELECT changes() AS changes").get()!.changes,
      );
      return { success: true, results, meta: { changes } };
    }
    async run() {
      return this.execute();
    }
    async all() {
      return this.execute();
    }
    async first(column?: string) {
      const row = this.execute().results[0] ?? null;
      return column && row ? row[column] : row;
    }
  }
  const db = {
    prepare(sql: string) {
      return new Statement(sql);
    },
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { db, sqlite, close: () => sqlite.close() };
}
