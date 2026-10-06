import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { dumpDatabase, mirrorMedia, sqlLiteral } from "./backup.ts";
import type { BackupBucket, BackupDatabase, D1Row } from "./backup.ts";

const TABLE_NAME = /FROM "(?<table>[^"]+)"/u;
const OFFSET = /OFFSET (?<offset>\d+)/u;

const schemaRows = (tables: readonly string[]): D1Row[] => [
  ...tables.map((name) => ({
    name,
    sql: `CREATE TABLE "${name}" (id TEXT)`,
    type: "table",
  })),
  {
    name: "search",
    sql: "CREATE VIRTUAL TABLE search USING fts5(body)",
    type: "table",
  },
  { name: "search_data", sql: "CREATE TABLE 'search_data'(id)", type: "table" },
  {
    name: "idx_posts",
    sql: "CREATE INDEX idx_posts ON posts(id)",
    type: "index",
  },
];

const fakeDatabase = (tables: Record<string, D1Row[]>): BackupDatabase => ({
  prepare: (sql) => ({
    all: async () => {
      await Promise.resolve();
      if (sql.includes("sqlite_master")) {
        return { results: schemaRows(Object.keys(tables)) };
      }
      const table = TABLE_NAME.exec(sql)?.groups?.table ?? "";
      const offset = Number(OFFSET.exec(sql)?.groups?.offset ?? 0);
      return { results: offset === 0 ? (tables[table] ?? []) : [] };
    },
  }),
});

const memoryBucket = (keys: string[] = []) => {
  const stored = new Set(keys);
  const bucket: BackupBucket = {
    get: async (key) => {
      await Promise.resolve();
      return stored.has(key) ? { body: new Blob(["x"]).stream() } : null;
    },
    head: async (key) => {
      await Promise.resolve();
      return stored.has(key) ? {} : null;
    },
    list: async () => {
      await Promise.resolve();
      return { objects: [...stored].map((key) => ({ key })), truncated: false };
    },
    put: async (key) => {
      await Promise.resolve();
      stored.add(key);
      return {};
    },
  };
  return { bucket, stored };
};

describe(sqlLiteral, () => {
  it("encodes SQLite literals", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral(new Uint8Array([1, 255]).buffer)).toBe("X'01ff'");
  });
});

describe(dumpDatabase, () => {
  it.effect(
    "writes schema, rows, then indexes, and skips FTS shadow tables",
    () =>
      Effect.gen(function* dumpsInOrder() {
        const sql = yield* dumpDatabase(fakeDatabase({ posts: [{ id: "a" }] }));
        expect(sql).toContain('INSERT INTO "posts" ("id") VALUES (\'a\');');
        expect(sql).not.toContain("search_data");
        expect(sql.indexOf("CREATE INDEX")).toBeGreaterThan(
          sql.indexOf("INSERT INTO")
        );
      })
  );
});

describe(mirrorMedia, () => {
  it.effect("copies only new media and skips EmDash's own backups", () =>
    Effect.gen(function* copiesNewMedia() {
      const media = memoryBucket([
        "a.jpg",
        "b.jpg",
        "backups/emdash-backup.json",
      ]);
      const backups = memoryBucket(["media/a.jpg"]);
      const copied = yield* mirrorMedia(media.bucket, backups.bucket);
      expect(copied).toBe(1);
      expect([...backups.stored].toSorted()).toStrictEqual([
        "media/a.jpg",
        "media/b.jpg",
      ]);
    })
  );
});
