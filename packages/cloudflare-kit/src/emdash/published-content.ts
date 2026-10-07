/* oxlint-disable no-await-in-loop, react-doctor/async-await-in-loop -- Native source pagination and D1 completion are sequenced to respect request budgets; field projection overlaps its bounded independent reads. */
/** Purpose-limited published presentation export and fresh native seed composition. */
import { secureCompare } from "@emdash-cms/auth";
import { Predicate, Schema } from "effect";
import {
  ContentRepository,
  MediaRepository,
  OptionsRepository,
  handleContentGet,
  handleContentList,
  handleContentUpdate,
  setSiteSettings,
  SchemaRegistry,
  normalizeBlocksData,
} from "emdash";
import type { ContentItem, SiteSettings, Storage } from "emdash";
import { validateSeed } from "emdash/seed";
import type { SeedFile, SeedField, SeedMenu } from "emdash/seed";

import { stageKind } from "../infra/stage.ts";
import policies from "./published-policy.json" with { type: "json" };

export const EXPORT_PATH = "/_content/published";
export const COMPLETION_PATH = "/_content/complete";
export const ASSET_COLLECTION = "published_assets";
const RECEIPT_KEY = "studio:published-content";
const MEDIA_PATH = /^\/_emdash\/api\/media\/file\/[a-zA-Z0-9_./-]+$/u;
const SAFE_PATH = /(?:^|\/)\.{1,2}(?:\/|$)/u;
const RecordValue = Schema.JsonObject;
type ContentData = typeof RecordValue.Type;
type ContentValue = Schema.Json | undefined;
const cleanJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json));
export const Identity = Schema.Struct({
  collection: Schema.NonEmptyString,
  locale: Schema.NonEmptyString,
  slug: Schema.NonEmptyString,
});
export type Identity = typeof Identity.Type;
const Entry = Schema.Struct({
  ...Identity.fields,
  data: RecordValue,
  references: Schema.Record(Schema.String, Schema.Array(Identity)),
  seo: Schema.Struct({
    canonical: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String),
    image: Schema.NullOr(Schema.String),
    noIndex: Schema.Boolean,
    title: Schema.NullOr(Schema.String),
  }),
});
export const PublishedSnapshot = Schema.Struct({
  entries: Schema.Array(Entry),
  menus: Schema.Array(RecordValue),
  origin: Schema.NonEmptyString,
  settings: RecordValue,
  site: Schema.Literals(["access-electric", "ms-custom-homes"]),
  version: Schema.Literal(1),
});
export type PublishedSnapshot = typeof PublishedSnapshot.Type;
export const decodeSnapshot = Schema.decodeUnknownSync(PublishedSnapshot);
export type PublishedSite = PublishedSnapshot["site"];
type Database = ConstructorParameters<typeof ContentRepository>[0];
interface Field {
  readonly slug: string;
  readonly type: string;
  readonly validation?: {
    readonly allowedTypes?: readonly string[];
    readonly subFields?: readonly Field[];
    readonly relation?: string;
    readonly options?: readonly string[];
  };
}
interface Policy {
  readonly origin: string;
  readonly collections: Readonly<Record<string, readonly Field[]>>;
  readonly blocks: Readonly<
    Record<
      string,
      readonly { readonly version: number; readonly fields: readonly Field[] }[]
    >
  >;
  readonly menus: readonly string[];
}
export class PublishedContentError extends Schema.TaggedError<PublishedContentError>()(
  "PublishedContentError",
  { message: Schema.String }
) {}
const fail = (message: string): never => {
  throw new PublishedContentError({ message });
};
export const contentPolicy = (site: string): Policy => {
  if (site !== "access-electric" && site !== "ms-custom-homes") {
    return fail("This site has no published-content policy");
  }
  return policies[site];
};
export const identityKey = (identity: Identity): string =>
  JSON.stringify([identity.collection, identity.slug, identity.locale]);
export const importAlias = (identity: Identity): string =>
  `published:${encodeURIComponent(identityKey(identity))}`;
export const authorizedContentRequest = (
  request: Request,
  bindings: {
    readonly STAGE?: string;
    readonly CMS_OWNER_SITE?: string;
    readonly PUBLISHED_CONTENT_EXPORT_TOKEN?: string;
    readonly CMS_BOOTSTRAP_TOKEN?: string;
  },
  purpose: "export" | "complete"
): boolean => {
  const kind = stageKind(bindings.STAGE ?? "");
  const allowed =
    purpose === "export"
      ? kind === "production"
      : ["development", "pull-request"].includes(kind);
  const credential =
    purpose === "export"
      ? bindings.PUBLISHED_CONTENT_EXPORT_TOKEN
      : bindings.CMS_BOOTSTRAP_TOKEN;
  const header =
    purpose === "export" ? "authorization" : "x-cms-bootstrap-token";
  const offered =
    purpose === "export"
      ? request.headers.get(header)?.replace(/^Bearer /u, "")
      : request.headers.get(header);
  return (
    allowed &&
    credential !== undefined &&
    credential.length >= 32 &&
    secureCompare(offered ?? "", credential)
  );
};
const record = (value: ContentValue, _location: string): ContentData =>
  Schema.decodeUnknownSync(RecordValue)(value);
export const publicMediaUrl = (value: string, origin: string): string => {
  const url = new URL(value, origin);
  const wrongOrigin =
    url.origin !== origin || url.username !== "" || url.password !== "";
  const wrongPath =
    !MEDIA_PATH.test(url.pathname) ||
    SAFE_PATH.test(url.pathname) ||
    /(?:^|[/\\])(?:\.|%2e){1,2}(?:[/\\]|$)/iu.test(value);
  if (wrongOrigin || wrongPath || url.search !== "" || url.hash !== "") {
    return fail(
      "Media must belong to the configured source's public media path"
    );
  }
  return url.href;
};
const mediaReference = async (
  db: Database,
  value: ContentValue,
  origin: string
): Promise<Schema.Json> => {
  if (value === null || value === undefined) {
    return null;
  }
  const input = record(value, "media");
  const id = input.id ?? input.mediaId ?? input._ref;
  if (!Predicate.isString(id)) {
    return fail("Referenced media has no native identity");
  }
  const media = await new MediaRepository(db).findById(id);
  if (!media || media.status !== "ready") {
    return fail("Referenced media is unavailable");
  }
  return {
    $media: {
      alt: Predicate.isString(input.alt) ? input.alt : (media.alt ?? ""),
      filename: media.filename,
      url: publicMediaUrl(
        `${origin}/_emdash/api/media/file/${media.storageKey}`,
        origin
      ),
    },
  };
};
/** Native SQLite boolean columns return 0/1; JSON block values remain booleans. */
const nativeBoolean = (value: ContentValue): boolean => {
  const decoded = Schema.decodeUnknownSync(
    Schema.Union([Schema.Boolean, Schema.Literal(0), Schema.Literal(1)])
  )(value);
  return decoded === true || decoded === 1;
};
class PublicProjector {
  constructor(db: Database, policy: Policy) {
    this.db = db;
    this.policy = policy;
  }
  private readonly db: Database;
  private readonly policy: Policy;
  async fields(
    data: ContentData,
    fields: readonly Field[]
  ): Promise<ContentData> {
    const rows = fields.filter(
      (field) => field.type !== "reference" && data[field.slug] !== undefined
    );
    const values = await Promise.all(
      rows.map(
        async (field) =>
          [field.slug, await this.value(data[field.slug], field)] as const
      )
    );
    return Object.fromEntries(values);
  }
  async portableText(value: ContentValue): Promise<Schema.Json> {
    const blocks = Schema.decodeUnknownSync(Schema.Array(RecordValue))(value);
    return await Promise.all(
      blocks.map(async (block) => {
        if (block._type === "image") {
          return cleanJson(
            JSON.stringify({
              _key: block._key,
              _type: "image",
              alignment: block.alignment,
              alt: block.alt,
              asset: await mediaReference(
                this.db,
                block.asset,
                this.policy.origin
              ),
              caption: block.caption,
            })
          );
        }
        if (block._type === "gallery") {
          return cleanJson(
            JSON.stringify({
              _key: block._key,
              _type: "gallery",
              images: await this.portableText(block.images),
            })
          );
        }
        if (block._type !== "block") {
          return fail("Unsupported public Portable Text block");
        }
        const children = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.Struct({
              _key: Schema.optionalKey(Schema.String),
              _type: Schema.Literal("span"),
              marks: Schema.optionalKey(Schema.Array(Schema.String)),
              text: Schema.String,
            })
          )
        )(block.children);
        const markDefs = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.Struct({
              _key: Schema.String,
              _type: Schema.Literal("link"),
              href: Schema.String,
            })
          )
        )(block.markDefs ?? []);
        return cleanJson(
          JSON.stringify({
            _key: block._key,
            _type: "block",
            children,
            level: block.level,
            listItem: block.listItem,
            markDefs,
            style: block.style,
          })
        );
      })
    );
  }
  async value(value: ContentValue, field: Field): Promise<Schema.Json> {
    if (value === null) {
      return null;
    }
    if (field.type === "image" || field.type === "file") {
      return await mediaReference(this.db, value, this.policy.origin);
    }
    if (field.type === "portableText") {
      return await this.portableText(value);
    }
    if (field.type === "repeater") {
      const values = Schema.decodeUnknownSync(Schema.Array(RecordValue))(value);
      return await Promise.all(
        values.map(async (data) =>
          cleanJson(
            JSON.stringify({
              _key: data._key,
              ...(await this.fields(data, field.validation?.subFields ?? [])),
            })
          )
        )
      );
    }
    if (field.type === "blocks") {
      const blocks = Schema.decodeUnknownSync(Schema.Array(RecordValue))(value);
      return await Promise.all(
        blocks.map(async (block) => {
          const type = Schema.decodeUnknownSync(Schema.String)(block._type);
          const version = Schema.decodeUnknownSync(Schema.Number)(
            block._version ?? 1
          );
          const definition = this.policy.blocks[type]?.find(
            (candidate) => candidate.version === version
          );
          if (definition === undefined) {
            return fail(
              `${type}: no public rendering policy for version ${version}`
            );
          }
          return cleanJson(
            JSON.stringify({
              _key: block._key,
              _type: type,
              _version: version,
              ...(await this.fields(block, definition.fields)),
            })
          );
        })
      );
    }
    if (["string", "text", "select", "datetime"].includes(field.type)) {
      return Schema.decodeUnknownSync(Schema.String)(value);
    }
    if (["integer", "number"].includes(field.type)) {
      return Schema.decodeUnknownSync(Schema.Number)(value);
    }
    if (field.type === "boolean") {
      return nativeBoolean(value);
    }
    return fail(`${field.slug}: unsupported public field type ${field.type}`);
  }
}
const exportSeoImage = async (
  db: Database,
  value: string,
  origin: string
): Promise<string> => {
  if (value.startsWith("/") || value.startsWith("https://")) {
    return publicMediaUrl(value, origin);
  }
  const media = await new MediaRepository(db).findById(value);
  const key = media?.storageKey ?? value;
  return publicMediaUrl(`${origin}/_emdash/api/media/file/${key}`, origin);
};
const verifyNativeMedia = async (
  db: Database,
  value: ContentValue,
  storage: Storage | null | undefined
) => {
  if (value === null || value === undefined) {
    return fail("Native seed missed required media");
  }
  const media = record(value, "Native imported media");
  const id = Schema.decodeUnknownSync(Schema.String)(media.id ?? media._ref);
  if (media.provider === "external") {
    return fail("Native seed did not download required public media");
  }
  const row = await new MediaRepository(db).findById(id);
  if (row === null) {
    return fail("Native seed missed a required media row");
  }
  if (storage === undefined || storage === null) {
    return fail("Completion requires destination media storage");
  }
  if (!(await storage.exists(row.storageKey))) {
    return fail("Native seed missed required media bytes");
  }
  return row;
};
interface Presentation {
  readonly settings: Partial<SiteSettings>;
  readonly menus: readonly SeedMenu[];
}
const liveIdentity = (row: ContentItem): Identity => ({
  collection: row.type,
  locale: row.locale ?? "en",
  slug: row.slug ?? fail("Public entry requires a slug"),
});
const readLiveRows = async (
  db: Database,
  collection: string
): Promise<ContentItem[]> => {
  const rows: ContentItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await handleContentList(db, collection, {
      cursor,
      limit: 50,
      status: "published",
    });
    if (!page.success) {
      return fail(`Cannot export ${collection}: ${page.error.code}`);
    }
    for (const entry of page.data.items) {
      const result = await handleContentGet(
        db,
        collection,
        entry.id,
        entry.locale ?? undefined,
        { includeDrafts: false }
      );
      if (!result.success || result.data.item.status !== "published") {
        return fail("Published content changed during export; retry");
      }
      rows.push(result.data.item);
    }
    cursor = page.data.nextCursor;
  } while (cursor !== undefined);
  return rows;
};
const publicReferences = (
  row: ContentItem,
  byId: ReadonlyMap<string, Identity>
): CompletionEntry["references"] => {
  if (row.type !== "categories") {
    return {};
  }
  const selection = row.references?.projects;
  if (selection?.nextCursor !== undefined) {
    return fail(
      "Public reference selection exceeds the native export page; no values were dropped"
    );
  }
  return {
    projects: (selection?.children ?? []).map(
      (child) =>
        byId.get(child.id) ??
        fail("Reference points outside published public content")
    ),
  };
};
const publicSettings = async (
  db: Database,
  settings: Partial<SiteSettings>,
  policy: Policy
): Promise<ContentData> => {
  const output: Record<string, Schema.Json> = {};
  for (const key of ["title", "tagline"] as const) {
    const value = settings[key];
    if (value !== undefined) {
      output[key] = value;
    }
  }
  if (settings.seo !== undefined) {
    const { seo } = settings;
    const value = cleanJson(
      JSON.stringify({
        bingVerification: seo.bingVerification,
        googleVerification: seo.googleVerification,
        robotsTxt: seo.robotsTxt,
        titleSeparator: seo.titleSeparator,
      })
    );
    const projected = { ...record(value, "public site SEO") };
    if (seo.defaultOgImage !== undefined) {
      projected.defaultOgImage = await mediaReference(
        db,
        Schema.decodeUnknownSync(RecordValue)(seo.defaultOgImage),
        policy.origin
      );
    }
    output.seo = projected;
  }
  return output;
};
/** Root GET handlers read live columns, without the editor's draft overlay. */
export const exportPublished = async (
  db: Database,
  site: PublishedSite,
  presentation: Presentation
): Promise<PublishedSnapshot> => {
  const policy = contentPolicy(site);
  const rows: ContentItem[] = [];
  for (const collection of Object.keys(policy.collections)) {
    rows.push(...(await readLiveRows(db, collection)));
  }
  const byId = new Map(rows.map((row) => [row.id, liveIdentity(row)]));
  const entries: PublishedSnapshot["entries"][number][] = [];
  const projector = new PublicProjector(db, policy);
  for (const row of rows) {
    const seo = row.seo ?? {
      canonical: null,
      description: null,
      image: null,
      noIndex: false,
      title: null,
    };
    entries.push({
      ...liveIdentity(row),
      data: await projector.fields(
        Schema.decodeUnknownSync(RecordValue)(row.data),
        policy.collections[row.type] ?? []
      ),
      references: publicReferences(row, byId),
      seo: {
        ...seo,
        image:
          seo.image === null
            ? null
            : await exportSeoImage(db, seo.image, policy.origin),
      },
    });
  }
  const allowedMenus = new Set(policy.menus);
  return decodeSnapshot({
    entries,
    menus: presentation.menus.filter((menu) => allowedMenus.has(menu.name)),
    origin: policy.origin,
    settings: await publicSettings(db, presentation.settings, policy),
    site,
    version: 1,
  });
};

export interface CompletionEntry extends Identity {
  readonly seo: (typeof Entry.Type)["seo"];
  readonly references: Readonly<Record<string, readonly Identity[]>>;
  readonly mediaPaths: readonly (readonly (string | number)[])[];
}
export interface FreshPlan {
  readonly identity: string;
  readonly site: PublishedSite;
  readonly origin: string;
  readonly seed: SeedFile;
  readonly entries: readonly CompletionEntry[];
  readonly assets: readonly string[];
  readonly settingsSeo?: Readonly<ContentData>;
}
export const FreshPlanDocument = Schema.Struct({
  assets: Schema.Array(Schema.String),
  entries: Schema.Array(
    Schema.Struct({
      ...Identity.fields,
      mediaPaths: Schema.Array(
        Schema.Array(Schema.Union([Schema.String, Schema.Number]))
      ),
      references: Entry.fields.references,
      seo: Entry.fields.seo,
    })
  ),
  identity: Schema.NonEmptyString,
  origin: Schema.String,
  seed: Schema.declare<SeedFile>((value): value is SeedFile => {
    try {
      return validateSeed(value).valid;
    } catch {
      return false;
    }
  }),
  settingsSeo: Schema.optionalKey(RecordValue),
  site: PublishedSnapshot.fields.site,
});
export const decodePlan = Schema.decodeUnknownSync(FreshPlanDocument);
const recordOrArrayValue = (
  value: ContentValue,
  key: string | number
): ContentValue => {
  if (Predicate.isNumber(key)) {
    return Schema.decodeUnknownSync(Schema.Array(Schema.Json))(value)[key];
  }
  return record(value, "media path")[key];
};
const mediaPaths = (
  value: ContentValue,
  current: readonly (string | number)[] = []
): (readonly (string | number)[])[] => {
  if (Schema.is(Schema.Array(Schema.Json))(value)) {
    return value.flatMap((child, index) =>
      mediaPaths(child, [...current, index])
    );
  }
  if (!Predicate.isObject(value) || value === null) {
    return [];
  }
  const data = record(value, "media path");
  if ("$media" in data) {
    return [current];
  }
  return Object.entries(data).flatMap(([key, child]) =>
    mediaPaths(child, [...current, key])
  );
};
export const SeedDocument = Schema.declare<SeedFile>(
  (value): value is SeedFile => {
    try {
      return validateSeed(value).valid;
    } catch {
      return false;
    }
  }
);
export const decodeSeed = Schema.decodeUnknownSync(SeedDocument);
const emptySeo: CompletionEntry["seo"] = {
  canonical: null,
  description: null,
  image: null,
  noIndex: false,
  title: null,
};
const SubField = Schema.Struct({
  defaultValue: Schema.optionalKey(Schema.Json),
  required: Schema.optionalKey(Schema.Boolean),
  slug: Schema.String,
  type: Schema.String,
  validation: Schema.optionalKey(RecordValue),
});
const fillFields = (
  fields: readonly {
    readonly slug: string;
    readonly type: string;
    readonly defaultValue?: unknown;
    readonly validation?: { readonly subFields?: unknown };
  }[],
  incoming: ContentData,
  starter: ContentData
): ContentData => {
  const output = { ...incoming };
  for (const field of fields) {
    if (output[field.slug] === undefined) {
      output[field.slug] = Schema.decodeUnknownSync(Schema.Json)(
        starter[field.slug] ?? field.defaultValue ?? null
      );
    }
    if (field.type === "repeater" && output[field.slug] !== null) {
      const subFields = field.validation?.subFields;
      if (subFields !== undefined) {
        const items = Schema.decodeUnknownSync(Schema.Array(RecordValue))(
          output[field.slug]
        );
        const starterItems = Schema.decodeUnknownSync(
          Schema.Array(RecordValue)
        )(starter[field.slug] ?? []);
        const byKey = new Map(
          starterItems.flatMap((item) =>
            Predicate.isString(item._key) ? [[item._key, item]] : []
          )
        );
        output[field.slug] = items.map((item) =>
          fillFields(
            Schema.decodeUnknownSync(Schema.Array(SubField))(subFields),
            item,
            (Predicate.isString(item._key)
              ? byKey.get(item._key)
              : undefined) ?? {}
          )
        );
      }
    }
  }
  return output;
};
const mergeBlocks = (
  branch: SeedFile,
  policy: Policy,
  value: ContentValue,
  starter: ContentValue
): Schema.Json => {
  const incoming =
    value === null || value === undefined
      ? []
      : Schema.decodeUnknownSync(Schema.Array(RecordValue))(value);
  const branchBlocks = Schema.decodeUnknownSync(Schema.Array(RecordValue))(
    starter ?? []
  );
  const definitions = new Map(
    branch.blockTypes?.map((block) => [block.slug, block])
  );
  const publicTypes = new Set(Object.keys(policy.blocks));
  const byKey = new Map(branchBlocks.map((block) => [block._key, block]));
  const merged = incoming.map((block) => {
    const type = Schema.decodeUnknownSync(Schema.String)(block._type);
    const version = Schema.decodeUnknownSync(Schema.Number)(
      block._version ?? 1
    );
    const definition =
      definitions
        .get(type)
        ?.versions.find((candidate) => candidate.version === version) ??
      fail(`${type}: no retained branch version ${version}`);
    const permitted = new Set([
      ...definition.fields.map((field) => field.slug),
      "_key",
      "_type",
      "_version",
    ]);
    for (const key of Object.keys(block)) {
      if (!permitted.has(key)) {
        fail(`${type}.${key}: incompatible field`);
      }
    }
    return fillFields(definition.fields, block, byKey.get(block._key) ?? {});
  });
  return [
    ...merged,
    ...branchBlocks.filter(
      (block) =>
        !publicTypes.has(Schema.decodeUnknownSync(Schema.String)(block._type))
    ),
  ];
};
const mergeEntry = (
  branch: SeedFile,
  policy: Policy,
  definition: NonNullable<SeedFile["collections"]>[number],
  incoming: PublishedSnapshot["entries"][number],
  starter: ContentData
): ContentData => {
  const targetFields = new Map(
    definition.fields.map((field) => [field.slug, field])
  );
  const sourceFields = new Map(
    policy.collections[definition.slug]?.map((field) => [field.slug, field])
  );
  for (const key of Object.keys(incoming.data)) {
    if (!targetFields.has(key)) {
      fail(`${definition.slug}.${key}: field removed in branch`);
    }
  }
  const data = {
    ...fillFields(
      definition.fields.filter((field) => field.type !== "reference"),
      incoming.data,
      starter
    ),
  };
  for (const field of definition.fields) {
    if (field.type === "reference") {
      data[field.slug] = null;
      if (field.required === true) {
        fail(
          `${definition.slug}.${field.slug}: required references cannot use fresh seed completion`
        );
      }
      continue;
    }
    const sourceField = sourceFields.get(field.slug);
    if (sourceField !== undefined && sourceField.type !== field.type) {
      fail(`${definition.slug}.${field.slug}: incompatible field type`);
    }
    if (field.type === "blocks") {
      data[field.slug] = mergeBlocks(
        branch,
        policy,
        data[field.slug],
        starter[field.slug]
      );
    }
  }
  const references = new Set(
    definition.fields.flatMap((field) =>
      field.type === "reference" ? [field.slug] : []
    )
  );
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !references.has(key))
  );
};
class FreshComposer {
  private readonly branch: SeedFile;
  private readonly policy: Policy;
  readonly seed: SeedFile;
  readonly entries: CompletionEntry[] = [];
  readonly assets = new Set<string>();
  private readonly identities = new Set<string>();
  private readonly collections: Map<
    string,
    NonNullable<SeedFile["collections"]>[number]
  >;
  private readonly rows = new Map<
    string,
    NonNullable<SeedFile["content"]>[string][number]
  >();
  constructor(branch: SeedFile, policy: Policy) {
    this.branch = branch;
    this.policy = policy;
    this.seed = structuredClone(branch);
    this.seed.content ??= {};
    this.collections = new Map(
      branch.collections?.map((collection) => [collection.slug, collection])
    );
    if (this.collections.has(ASSET_COLLECTION)) {
      fail("Reserved published media collection already exists");
    }
    for (const [collection, entries] of Object.entries(this.seed.content)) {
      for (const row of entries) {
        this.rows.set(
          identityKey({
            collection,
            locale: row.locale ?? branch.defaultLocale ?? "en",
            slug: row.slug ?? row.id,
          }),
          row
        );
      }
    }
  }
  add(entry: PublishedSnapshot["entries"][number]): void {
    if (!Object.hasOwn(this.policy.collections, entry.collection)) {
      fail("Snapshot contains a non-public collection");
    }
    const key = identityKey(entry);
    if (this.identities.has(key)) {
      fail("Duplicate semantic identity");
    }
    this.identities.add(key);
    const definition =
      this.collections.get(entry.collection) ??
      fail(`Branch lacks ${entry.collection}`);
    const starter = this.rows.get(key);
    const data = mergeEntry(
      this.branch,
      this.policy,
      definition,
      entry,
      Schema.decodeUnknownSync(RecordValue)(starter?.data ?? {})
    );
    const rows = this.seed.content?.[entry.collection] ?? [];
    const row = {
      data,
      id: starter?.id ?? importAlias(entry),
      locale: entry.locale,
      slug: entry.slug,
      status: "published" as const,
    };
    if (starter === undefined) {
      rows.push(row);
    } else {
      Object.assign(starter, row);
    }
    if (this.seed.content !== undefined) {
      this.seed.content[entry.collection] = rows;
    }
    this.rows.set(key, row);
    this.checkMedia(entry.data);
    if (entry.seo.image !== null) {
      this.assets.add(publicMediaUrl(entry.seo.image, this.policy.origin));
    }
    this.entries.push({
      collection: entry.collection,
      locale: entry.locale,
      mediaPaths: mediaPaths(data),
      references: entry.references,
      seo: entry.seo,
      slug: entry.slug,
    });
  }
  private checkMedia(data: ContentData): void {
    for (const segments of mediaPaths(data)) {
      let value: ContentValue = data;
      for (const segment of segments) {
        value = recordOrArrayValue(value, segment);
      }
      const reference = Schema.decodeUnknownSync(
        Schema.Struct({ $media: Schema.Struct({ url: Schema.String }) })
      )(value);
      publicMediaUrl(reference.$media.url, this.policy.origin);
    }
  }
  finishReferences(): void {
    const completionKeys = new Set(this.entries.map(identityKey));
    const byAlias = new Map(
      [...this.rows.entries()].map(([key, row]) => [
        row.id,
        Schema.decodeUnknownSync(
          Schema.fromJsonString(
            Schema.Tuple([Schema.String, Schema.String, Schema.String])
          )
        )(key),
      ])
    );
    for (const [collection, rows] of Object.entries(this.seed.content ?? {})) {
      if (!Object.hasOwn(this.policy.collections, collection)) {
        continue;
      }
      const definition = this.collections.get(collection);
      const fields =
        definition?.fields.filter((field) => field.type === "reference") ?? [];
      for (const row of rows) {
        const identity = {
          collection,
          locale: row.locale ?? this.branch.defaultLocale ?? "en",
          slug: row.slug ?? fail("Public branch entry requires slug"),
        };
        if (!completionKeys.has(identityKey(identity))) {
          this.addStarterCompletion(identity, row, fields, byAlias);
        }
        const references = new Set(fields.map((field) => field.slug));
        row.data = Object.fromEntries(
          Object.entries(row.data).filter(([key]) => !references.has(key))
        );
      }
    }
    this.validateReferences();
  }
  private validateReferences(): void {
    for (const entry of this.entries) {
      for (const [field, targets] of Object.entries(entry.references)) {
        if (entry.collection !== "categories" || field !== "projects") {
          fail("Unsupported semantic reference selection");
        }
        const definition = this.collections
          .get(entry.collection)
          ?.fields.find((candidate) => candidate.slug === field);
        if (
          definition?.type !== "reference" ||
          definition.validation?.relation !== "category_projects"
        ) {
          fail("Branch reference contract changed");
        }
        for (const target of targets) {
          if (!this.rows.has(identityKey(target))) {
            fail("Reference target is absent from fresh plan");
          }
        }
      }
    }
  }
  private addStarterCompletion(
    identity: Identity,
    row: NonNullable<SeedFile["content"]>[string][number],
    fields: readonly SeedField[],
    byAlias: ReadonlyMap<string, unknown>
  ): void {
    const references: Record<string, Identity[]> = {};
    if (identity.collection === "categories") {
      const selections = Schema.decodeUnknownSync(Schema.Array(Schema.String))(
        row.data.projects ?? []
      );
      references.projects = selections.map((alias) => {
        const [collection, slug, locale] = Schema.decodeUnknownSync(
          Schema.Tuple([Schema.String, Schema.String, Schema.String])
        )(byAlias.get(alias.replace(/^\$ref:/u, "")));
        return { collection, locale, slug };
      });
    }
    for (const field of fields) {
      if (field.required === true) {
        fail(
          "Required reference fields are unsupported for fresh seed completion"
        );
      }
    }
    this.entries.push({
      ...identity,
      mediaPaths: mediaPaths(Schema.decodeUnknownSync(RecordValue)(row.data)),
      references,
      seo: emptySeo,
    });
  }
  menus(snapshot: PublishedSnapshot): void {
    const menus =
      decodeSeed({ menus: snapshot.menus, version: "1" }).menus ?? [];
    const allowed = new Set(this.policy.menus);
    const existing = new Map(
      this.seed.menus?.map((menu) => [
        `${menu.name}:${menu.locale ?? "en"}`,
        menu,
      ])
    );
    for (const menu of menus) {
      if (!allowed.has(menu.name)) {
        fail("Snapshot contains a non-public menu");
      }
      existing.set(`${menu.name}:${menu.locale ?? "en"}`, menu);
    }
    this.seed.menus = [...existing.values()];
  }
  settings(snapshot: PublishedSnapshot): ContentData | undefined {
    const seo =
      snapshot.settings.seo === undefined
        ? undefined
        : record(snapshot.settings.seo, "site SEO");
    if (seo?.defaultOgImage !== undefined) {
      const reference = Schema.decodeUnknownSync(
        Schema.Struct({ $media: Schema.Struct({ url: Schema.String }) })
      )(seo.defaultOgImage);
      this.assets.add(publicMediaUrl(reference.$media.url, this.policy.origin));
    }
    const settings = { ...this.branch.settings };
    if (Predicate.isString(snapshot.settings.title)) {
      settings.title = snapshot.settings.title;
    }
    if (Predicate.isString(snapshot.settings.tagline)) {
      settings.tagline = snapshot.settings.tagline;
    }
    if (seo !== undefined) {
      const plain = { ...seo };
      delete plain.defaultOgImage;
      settings.seo = plain;
    }
    this.seed.settings = settings;
    return seo;
  }
  assetSeed(identity: string): void {
    const collection = {
      fields: [
        { label: "Image", slug: "image", type: "image" as const },
        { label: "Plan identity", slug: "identity", type: "string" as const },
      ],
      hidden: true,
      label: "Published SEO assets",
      routable: false,
      slug: ASSET_COLLECTION,
    };
    this.seed.collections ??= [];
    this.seed.collections.push(collection);
    if (this.seed.content !== undefined) {
      this.seed.content[ASSET_COLLECTION] = [...this.assets].map(
        (url, index) => ({
          data: { image: { $media: { url } } },
          id: `published-asset-${index}`,
          slug: `asset-${index}`,
          status: "published",
        })
      );
      this.seed.content[ASSET_COLLECTION].push({
        data: { identity },
        id: "published-plan",
        slug: "plan",
        status: "published",
      });
    }
  }
}
/** Keeps branch schema and starter-only entries; no source schema is accepted. */
export const composeFreshSeed = (
  branch: SeedFile,
  snapshot: PublishedSnapshot,
  site: PublishedSite
): FreshPlan => {
  const policy = contentPolicy(site);
  if (snapshot.site !== site || snapshot.origin !== policy.origin) {
    return fail("Published source/site mismatch");
  }
  const composer = new FreshComposer(decodeSeed(branch), policy);
  for (const entry of snapshot.entries) {
    composer.add(entry);
  }
  composer.finishReferences();
  composer.menus(snapshot);
  const settingsSeo = composer.settings(snapshot);
  // The native seed carries this identity before completion can write a receipt.
  const identity = crypto.randomUUID();
  composer.assetSeed(identity);
  decodeSeed(composer.seed);
  return {
    assets: [...composer.assets],
    entries: composer.entries,
    identity,
    origin: policy.origin,
    seed: composer.seed,
    settingsSeo,
    site,
  };
};

type CheckedField = Pick<SeedField, "type" | "required" | "validation">;
const FieldKind = Schema.Literals([
  "string",
  "text",
  "image",
  "file",
  "boolean",
  "integer",
  "number",
  "select",
  "datetime",
  "portableText",
  "blocks",
  "repeater",
  "reference",
  "json",
]);
class FieldPreflight {
  check(field: CheckedField, value: ContentValue, location: string): void {
    if (value === undefined || value === null || value === "") {
      if (field.required === true) {
        fail(`${location}: required value missing`);
      }
      return;
    }
    if (["blocks", "portableText", "repeater"].includes(field.type)) {
      this.array(field, value, location);
      return;
    }
    if (["string", "text", "select", "datetime"].includes(field.type)) {
      Schema.decodeUnknownSync(Schema.String)(value);
    } else if (field.type === "boolean") {
      nativeBoolean(value);
    } else if (["integer", "number"].includes(field.type)) {
      Schema.decodeUnknownSync(Schema.Number)(value);
      if (field.type === "integer" && !Number.isInteger(value)) {
        fail(`${location}: expected integer`);
      }
    } else if (["image", "file"].includes(field.type)) {
      Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(value);
    } else if (field.type !== "json") {
      fail(`${location}: unsupported field type ${field.type}`);
    }
    const options = field.validation?.options;
    if (
      field.type === "select" &&
      Array.isArray(options) &&
      !options.includes(value)
    ) {
      fail(`${location}: invalid option`);
    }
  }
  private array(
    field: CheckedField,
    value: ContentValue,
    location: string
  ): void {
    const values = Schema.decodeUnknownSync(Schema.Array(Schema.Json))(value);
    const validation = field.validation ?? {};
    if (
      Predicate.isNumber(validation.maxItems) &&
      values.length > validation.maxItems
    ) {
      fail(`${location}: too many items`);
    }
    if (field.type !== "repeater" || validation.subFields === undefined) {
      return;
    }
    const fields = Schema.decodeUnknownSync(Schema.Array(SubField))(
      validation.subFields
    );
    for (const [index, item] of values.entries()) {
      const data = record(item, location);
      for (const sub of fields) {
        this.check(
          { ...sub, type: Schema.decodeUnknownSync(FieldKind)(sub.type) },
          data[sub.slug],
          `${location}[${index}].${sub.slug}`
        );
      }
    }
  }
}
const fieldPreflight = new FieldPreflight();
/** This gate runs against a disposable schema DB, before a candidate is activated. */
export const preflightFresh = async (
  db: Database,
  plan: FreshPlan
): Promise<void> => {
  const registry = new SchemaRegistry(db);
  for (const [collection, rows] of Object.entries(plan.seed.content ?? {})) {
    const definition = await registry.getCollectionWithFields(collection);
    if (!definition) {
      return fail(`Missing branch collection ${collection}`);
    }
    for (const row of rows) {
      const stored = await new ContentRepository(db).findBySlug(
        collection,
        row.slug ?? "",
        row.locale
      );
      if (!stored) {
        return fail("Disposable seed missed an entry");
      }
      const data = Schema.decodeUnknownSync(RecordValue)(stored.data);
      for (const field of definition.fields) {
        if (field.type === "reference") {
          continue;
        }
        fieldPreflight.check(
          {
            required: field.required,
            type: field.type,
            validation:
              field.validation === undefined
                ? undefined
                : { ...field.validation },
          },
          data[field.slug],
          `${collection}.${row.slug}.${field.slug}`
        );
      }
      await normalizeBlocksData(
        db,
        definition,
        data,
        {},
        { restoreBlocks: true },
        false
      );
    }
  }
};
type ImportedAssets = ReadonlyMap<
  string,
  { readonly id: string; readonly storageKey: string }
>;
const importedAssets = async (
  db: Database,
  plan: FreshPlan,
  storage: Storage | null | undefined
) => {
  const repo = new ContentRepository(db);
  const assetIds = new Map<
    string,
    { readonly id: string; readonly storageKey: string }
  >();
  for (const [index, url] of plan.assets.entries()) {
    const asset =
      (await repo.findBySlug(ASSET_COLLECTION, `asset-${index}`)) ??
      fail("Native seed missed a required SEO asset entry");
    const media = await verifyNativeMedia(
      db,
      Schema.decodeUnknownSync(RecordValue)(asset.data).image,
      storage
    );
    assetIds.set(url, media);
  }
  return assetIds;
};
const completeEntry = async (
  db: Database,
  entry: CompletionEntry,
  assetIds: ImportedAssets,
  storage: Storage | null | undefined
): Promise<void> => {
  const repo = new ContentRepository(db);
  const destination = await repo.findBySlug(
    entry.collection,
    entry.slug,
    entry.locale
  );
  if (!destination || destination.status !== "published") {
    return fail("Native seed missed a published entry");
  }
  for (const segments of entry.mediaPaths) {
    let value: ContentValue = Schema.decodeUnknownSync(RecordValue)(
      destination.data
    );
    for (const segment of segments) {
      value = recordOrArrayValue(value, segment);
    }
    await verifyNativeMedia(db, value, storage);
  }
  const references: Record<string, string[]> = {};
  for (const [field, targets] of Object.entries(entry.references)) {
    references[field] = [];
    for (const target of targets) {
      const child = await repo.findBySlug(
        target.collection,
        target.slug,
        target.locale
      );
      if (!child || child.status !== "published") {
        return fail("Native seed missed a reference target");
      }
      references[field]?.push(child.id);
    }
  }
  const seo = {
    ...entry.seo,
    image:
      entry.seo.image === null
        ? null
        : `/_emdash/api/media/file/${(assetIds.get(entry.seo.image) ?? fail("SEO image missing")).storageKey}`,
  };
  const result = await handleContentUpdate(
    db,
    entry.collection,
    destination.id,
    { references, seo }
  );
  if (!result.success) {
    return fail(`Completion refused: ${result.error.code}`);
  }
};
const completeSettingsSeo = async (
  db: Database,
  plan: FreshPlan,
  assetIds: ImportedAssets
): Promise<void> => {
  if (plan.settingsSeo?.defaultOgImage !== undefined) {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({
        $media: Schema.Struct({
          alt: Schema.optionalKey(Schema.String),
          url: Schema.String,
        }),
      })
    )(plan.settingsSeo.defaultOgImage);
    const mediaId = (
      assetIds.get(input.$media.url) ?? fail("Site SEO image missing")
    ).id;
    await setSiteSettings(
      { seo: { defaultOgImage: { alt: input.$media.alt, mediaId } } },
      db
    );
  }
};
/** No client-supplied bundle/destination. Completion uses only the compiled plan. */
export const completeFresh = async (
  db: Database,
  plan: FreshPlan,
  trustedStage: string,
  trustedSite: string,
  storage?: Storage | null
): Promise<{ complete: boolean; index: number; total: number }> => {
  if (
    !["development", "pull-request"].includes(stageKind(trustedStage)) ||
    trustedSite !== plan.site
  ) {
    return fail("Destination stage/site mismatch");
  }
  const options = new OptionsRepository(db);
  const [receipt, setup, digest] = await Promise.all([
    options.get(RECEIPT_KEY),
    options.get("emdash:setup_state"),
    crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(plan))
    ),
  ]);
  const signature = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const progress =
    receipt === null || receipt === undefined
      ? { complete: false, index: 0, signature }
      : Schema.decodeUnknownSync(
          Schema.Struct({
            complete: Schema.Boolean,
            index: Schema.Number,
            signature: Schema.String,
          })
        )(receipt);
  if (progress.complete) {
    return {
      complete: true,
      index: progress.index,
      total: plan.entries.length,
    };
  }
  if (progress.signature !== signature) {
    return fail(
      "Incomplete destination belongs to another published content plan"
    );
  }
  const marker = await new ContentRepository(db).findBySlug(
    ASSET_COLLECTION,
    "plan"
  );
  if (marker?.data.identity !== plan.identity) {
    return fail("Native seed belongs to another published content plan");
  }

  if (
    record(Schema.decodeUnknownSync(Schema.Json)(setup), "native setup")
      .step !== "site_complete" ||
    (await options.get("emdash:setup_complete")) === true
  ) {
    return fail("Completion is only allowed before first owner provisioning");
  }
  const assetIds = await importedAssets(db, plan, storage);
  // Four entries per request bounds D1 completion work independently of native setup.
  const end = Math.min(progress.index + 4, plan.entries.length);
  for (const entry of plan.entries.slice(progress.index, end)) {
    await completeEntry(db, entry, assetIds, storage);
  }
  const complete = end === plan.entries.length;
  if (complete) {
    await completeSettingsSeo(db, plan, assetIds);
  }
  await options.set(RECEIPT_KEY, { complete, index: end, signature });
  return { complete, index: end, total: plan.entries.length };
};
