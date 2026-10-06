/**
 * Daily off-database backup for prod sites: a restorable SQL dump of the D1
 * database plus an incremental mirror of the media bucket, both written to a
 * separate, retained R2 bucket.
 *
 * D1 Time Travel (30 days, point-in-time) is the primary restore path; these
 * dumps outlive it and survive deleting the database. Restore a dump into a
 * fresh database with:
 *
 *   gunzip -c 2026-10-05.sql.gz > restore.sql
 *   bunx wrangler d1 execute <database> --remote --file restore.sql
 */
import { Effect, Predicate, Schema } from "effect";

/** A value D1 can return for a column. */
export type D1Value = string | number | null | ArrayBuffer;
export type D1Row = Readonly<Record<string, D1Value>>;

/** The subset of the D1 binding the backup reads. */
export interface BackupDatabase {
  readonly prepare: (query: string) => {
    readonly all: () => Promise<{ results: D1Row[] }>;
  };
}

/** The subset of the R2 binding the backup uses. */
export interface BackupBucket {
  readonly list: (options?: { cursor?: string }) => Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  readonly head: (key: string) => Promise<object | null>;
  readonly get: (key: string) => Promise<{ body: ReadableStream } | null>;
  readonly put: (
    key: string,
    value: ReadableStream | ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string; contentEncoding?: string };
    }
  ) => Promise<object | null>;
}

export class BackupFailed extends Schema.TaggedError<BackupFailed>()(
  "BackupFailed",
  { cause: Schema.Defect(), step: Schema.String }
) {}

const PAGE_SIZE = 500;
/** EmDash keeps its own JSON exports under this media prefix; they are not media. */
const SKIPPED_MEDIA_PREFIX = "backups/";
const FTS_SHADOW_SUFFIXES = [
  "_config",
  "_content",
  "_data",
  "_docsize",
  "_idx",
];

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

const hexBytes = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

/** One SQLite literal for a D1 value. */
export const sqlLiteral = (value: D1Value): string => {
  if (value === null) {
    return "NULL";
  }
  if (Predicate.isNumber(value)) {
    return String(value);
  }
  if (value instanceof ArrayBuffer) {
    return `X'${hexBytes(value)}'`;
  }
  return `'${value.replaceAll("'", "''")}'`;
};

const attempt = <A>(step: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new BackupFailed({ cause, step }),
    try: run,
  });

const query = (db: BackupDatabase, step: string, sql: string) =>
  attempt(step, async () => {
    const { results } = await db.prepare(sql).all();
    return results;
  });

const SchemaEntries = Schema.Array(
  Schema.Struct({
    name: Schema.String,
    sql: Schema.String,
    type: Schema.String,
  })
);

const SCHEMA_QUERY =
  "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type = 'table' DESC, name";

const dumpTable = Effect.fn("dumpTable")(function* dumpTable(
  db: BackupDatabase,
  table: string
) {
  const lines: string[] = [];
  let offset = 0;
  let pageLength = PAGE_SIZE;
  while (pageLength === PAGE_SIZE) {
    const rows = yield* query(
      db,
      `rows:${table}`,
      `SELECT * FROM ${quoteIdentifier(table)} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
    );
    for (const row of rows) {
      const columns = Object.keys(row).map(quoteIdentifier).join(", ");
      const values = Object.values(row).map(sqlLiteral).join(", ");
      lines.push(
        `INSERT INTO ${quoteIdentifier(table)} (${columns}) VALUES (${values});`
      );
    }
    pageLength = rows.length;
    offset += PAGE_SIZE;
  }
  return lines;
});

/** A complete, replayable SQL script for the database (schema, rows, then indexes). */
export const dumpDatabase = Effect.fn("dumpDatabase")(function* dumpDatabase(
  db: BackupDatabase
) {
  const entries = yield* query(db, "schema", SCHEMA_QUERY).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(SchemaEntries)),
    Effect.mapError((cause) => new BackupFailed({ cause, step: "schema" }))
  );
  const virtualTables = entries.flatMap((entry) =>
    entry.sql.toUpperCase().startsWith("CREATE VIRTUAL TABLE")
      ? [entry.name]
      : []
  );
  const isShadowTable = (name: string) =>
    virtualTables.some((table) =>
      FTS_SHADOW_SUFFIXES.some((suffix) => name === `${table}${suffix}`)
    );

  const lines = ["PRAGMA foreign_keys = OFF;"];
  for (const entry of entries) {
    if (entry.type === "table" && !isShadowTable(entry.name)) {
      lines.push(`${entry.sql};`, ...(yield* dumpTable(db, entry.name)));
    }
  }
  for (const entry of entries) {
    if (entry.type !== "table") {
      lines.push(`${entry.sql};`);
    }
  }
  lines.push("PRAGMA foreign_keys = ON;");
  return `${lines.join("\n")}\n`;
});

/** R2 needs a known length, so the compressed dump is buffered (dumps are small). */
const gzip = async (text: string): Promise<ArrayBuffer> =>
  await new Response(
    new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))
  ).arrayBuffer();

const listKeys = Effect.fn("listKeys")(function* listKeys(
  bucket: BackupBucket
) {
  let page = yield* attempt("media:list", async () => await bucket.list());
  const keys = page.objects.map((object) => object.key);
  while (page.truncated && page.cursor !== undefined) {
    const { cursor } = page;
    page = yield* attempt(
      "media:list",
      async () => await bucket.list({ cursor })
    );
    keys.push(...page.objects.map((object) => object.key));
  }
  return keys;
});

const copyIfMissing = Effect.fn("copyIfMissing")(function* copyIfMissing(
  media: BackupBucket,
  backups: BackupBucket,
  key: string
) {
  const target = `media/${key}`;
  const existing = yield* attempt(
    "media:head",
    async () => await backups.head(target)
  );
  const source =
    existing === null
      ? yield* attempt("media:get", async () => await media.get(key))
      : null;
  if (source === null) {
    return false;
  }
  yield* attempt(
    "media:put",
    async () => await backups.put(target, source.body)
  );
  return true;
});

/** Copies media objects not yet in the backup bucket (by key; media keys are immutable). */
export const mirrorMedia = Effect.fn("mirrorMedia")(function* mirrorMedia(
  media: BackupBucket,
  backups: BackupBucket
) {
  const keys = yield* listKeys(media);
  const copied = yield* Effect.forEach(
    keys.filter((key) => !key.startsWith(SKIPPED_MEDIA_PREFIX)),
    (key) => copyIfMissing(media, backups, key)
  );
  return copied.filter(Boolean).length;
});

export const runBackup = Effect.fn("runBackup")(function* runBackup(options: {
  readonly db: BackupDatabase;
  /** The CMS media bucket to mirror; sites without a CMS have none. */
  readonly media?: BackupBucket;
  readonly backups: BackupBucket;
  readonly now: Date;
}) {
  const sql = yield* dumpDatabase(options.db);
  const key = `d1/${options.now.toISOString().slice(0, 10)}.sql.gz`;
  const body = yield* attempt("dump:gzip", async () => await gzip(sql));
  yield* attempt(
    "dump:put",
    async () =>
      await options.backups.put(key, body, {
        httpMetadata: {
          contentEncoding: "gzip",
          contentType: "application/sql",
        },
      })
  );
  const mediaCopied =
    options.media === undefined
      ? 0
      : yield* mirrorMedia(options.media, options.backups);
  yield* Effect.logInfo("backup complete").pipe(
    Effect.annotateLogs({ bytes: sql.length, key, mediaCopied })
  );
  return { key, mediaCopied };
});
