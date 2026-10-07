import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  composeFreshSeed,
  contentPolicy,
  decodeSeed,
  decodeSnapshot,
} from "@jakebodea/cloudflare-kit/emdash/published-content";
import { validateFreshPlan } from "@jakebodea/cloudflare-kit/emdash/published-preflight";
import {
  publishedContentDigest,
  writeBuildInputs,
} from "@jakebodea/cloudflare-kit/infra";
/** Real native Workers/D1/R2 fixture. No provider credentials, deploys, email or form requests. */
import { Schema } from "effect";

import { request } from "../../packages/control-app/src/http.ts";
import { seedStage } from "../../packages/control-app/src/seed.ts";
import { smoke } from "../../packages/control-app/src/smoke.ts";
import { controlCheck } from "./control-check.ts";
import { LOCAL_CMS_BOOTSTRAP_TOKEN, localWorker } from "./local-worker.ts";

const RELATION_TITLE = "Production relationship project";
const SITE = "access-electric";
const root = path.resolve(import.meta.dirname, "../..");
const directory = path.join(root, "apps/access-electric");
const output = path.join(root, ".artifacts/prod-content/worker");
mkdirSync(output, { recursive: true });
rmSync(path.join(output, "results.json"), { force: true });
const inputsFile = path.join(directory, ".build-inputs.json");
const planFile = path.join(directory, ".published-content.json");
const priorInputs = existsSync(inputsFile)
  ? readFileSync(inputsFile)
  : undefined;
const priorPlan = existsSync(planFile) ? readFileSync(planFile) : undefined;
const credential = "synthetic-published-export-credential-000001";
const policy = contentPolicy(SITE);
const checks: string[] = [];
let source: Awaited<ReturnType<typeof localWorker>> | undefined;
let destination: Awaited<ReturnType<typeof localWorker>> | undefined;
const build = () =>
  execFileSync("bun", ["run", "build"], {
    cwd: directory,
    env: { ...process.env, ASTRO_STANDALONE_BUILD: "1" },
    stdio: "pipe",
  });
const restore = (file: string, data: Buffer | undefined): void => {
  if (data === undefined) {
    rmSync(file, { force: true });
  } else {
    writeFileSync(file, data);
  }
};
try {
  writeBuildInputs(directory, {
    contentDigest: "seed",
    seedMediaBase: "https://accesselectricinc.com/media",
  });
  writeFileSync(path.join(output, "seed-build.log"), build());
  source = await localWorker(directory, true, {
    exportToken: credential,
    stage: "prod",
  });
  await seedStage(source.origin, LOCAL_CMS_BOOTSTRAP_TOKEN);
  const db = await source.runtime.getD1Database("DB");
  const owner = await db
    .prepare("SELECT id,email FROM users")
    .first<{ id: string; email: string }>();
  assert.ok(owner);
  // Synthetic, short-lived auth exists only in this disposable local fixture. No mail is sent.
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256")
    .update(Buffer.from(token, "base64url"))
    .digest("base64url");
  await db
    .prepare(
      "INSERT INTO auth_tokens (hash,user_id,email,type,expires_at) VALUES (?,?,?,?,?)"
    )
    .bind(
      hash,
      owner.id,
      owner.email,
      "magic_link",
      new Date(Date.now() + 60_000).toISOString()
    )
    .run();
  const auth = await request(
    `${source.origin}/_emdash/api/auth/magic-link/verify`,
    {
      body: JSON.stringify({ token }),
      headers: { "content-type": "application/json", origin: source.origin },
      method: "POST",
    }
  );
  assert.equal(auth.status, 200);
  const cookie = auth.headers
    .getSetCookie()
    .map((part) => part.split(";")[0])
    .join("; ");
  const call = async (
    route: string,
    body: Schema.JsonObject,
    method = "POST"
  ) => {
    const response = await request(`${source?.origin}${route}`, {
      body: JSON.stringify(body),
      headers: {
        "X-EmDash-Request": "1",
        "content-type": "application/json",
        cookie,
        origin: source?.origin ?? "",
      },
      method,
    });
    assert.equal(response.ok, true, await response.clone().text());
    return Schema.decodeUnknownSync(
      Schema.Struct({
        data: Schema.Struct({ item: Schema.Struct({ id: Schema.String }) }),
      })
    )(await response.json());
  };
  const project = await call("/_emdash/api/content/projects", {
    data: { progress: "completed", title: RELATION_TITLE },
    slug: "relationship-fixture",
  });
  await call(
    `/_emdash/api/content/projects/${project.data.item.id}/publish`,
    {}
  );
  // Cross the old 120-entry completion ceiling through real native content APIs.
  await Promise.all(
    Array.from({ length: 45 }, async (_, index) => {
      const extra = await call("/_emdash/api/content/projects", {
        data: {
          progress: "completed",
          title: `Completion budget project ${index}`,
        },
        slug: `completion-budget-${index}`,
      });
      await call(
        `/_emdash/api/content/projects/${extra.data.item.id}/publish`,
        {}
      );
    })
  );
  const category = await call(
    "/_emdash/api/content/categories/k-12-schools",
    { references: { projects: [project.data.item.id] } },
    "PUT"
  );
  await call(
    `/_emdash/api/content/categories/${category.data.item.id}/publish`,
    {}
  );
  const lead = await call("/_emdash/api/content/leads", {
    data: {
      email: "private@example.test",
      message: "Excluded",
      title: "PRIVATE PUBLISHED LEAD",
    },
    slug: "private-lead",
  });
  await call(`/_emdash/api/content/leads/${lead.data.item.id}/publish`, {});
  const seoMedia = await db
    .prepare("SELECT id,storage_key FROM media WHERE status='ready' LIMIT 1")
    .first<{ id: string; storage_key: string }>();
  assert.ok(seoMedia);
  const seoAbout = await call(
    "/_emdash/api/content/pages/about",
    {
      seo: {
        description:
          "Access Electric delivers commercial electrical construction with experienced crews and decades of project experience across Southern California.",
        image: `/_emdash/api/media/file/${seoMedia.storage_key}`,
        title: "About Access Electric | Licensed Electrical Contractor",
      },
    },
    "PUT"
  );
  await call(`/_emdash/api/content/pages/${seoAbout.data.item.id}/publish`, {});
  const settingsUpdate = await request(
    `${source.origin}/_emdash/api/settings`,
    {
      body: JSON.stringify({
        seo: {
          defaultOgImage: { alt: "Public site image", mediaId: seoMedia.id },
          titleSeparator: "|",
        },
      }),
      headers: {
        "X-EmDash-Request": "1",
        "content-type": "application/json",
        cookie,
        origin: source.origin,
      },
      method: "POST",
    }
  );
  assert.equal(settingsUpdate.status, 200, await settingsUpdate.clone().text());
  const liveAbout = await db
    .prepare("SELECT title FROM ec_pages WHERE slug='about'")
    .first<{ title: string }>();
  assert.ok(liveAbout);
  await call(
    "/_emdash/api/content/pages/about",
    { data: { title: "NEVER EXPORT DRAFT OVERLAY" } },
    "PUT"
  );
  const unauthorized = await request(`${source.origin}/_content/published`);
  assert.equal(unauthorized.status, 401);
  const mismatch = await request(
    `${source.origin}/_content/published?site=ms-custom-homes`,
    { headers: { authorization: `Bearer ${credential}` } }
  );
  assert.equal(mismatch.status, 400);
  const genericAccess = await request(
    `${source.origin}/_emdash/api/content/leads`,
    { headers: { authorization: `Bearer ${credential}` } }
  );
  assert.equal(genericAccess.status, 401);
  const forbiddenCompletion = await request(
    `${source.origin}/_content/complete`,
    {
      headers: { "x-cms-bootstrap-token": LOCAL_CMS_BOOTSTRAP_TOKEN },
      method: "POST",
    }
  );
  assert.equal(forbiddenCompletion.status, 401);
  const response = await request(`${source.origin}/_content/published`, {
    headers: { authorization: `Bearer ${credential}` },
  });
  assert.equal(response.status, 200, await response.clone().text());
  const snapshot = decodeSnapshot(await response.json());
  writeFileSync(
    path.join(output, "published-export.json"),
    JSON.stringify(snapshot, null, 2)
  );
  assert.equal(
    snapshot.entries.find(
      (entry) => entry.collection === "pages" && entry.slug === "about"
    )?.data.title,
    liveAbout.title
  );
  assert.ok(!JSON.stringify(snapshot).includes("PRIVATE PUBLISHED LEAD"));
  assert.ok(!JSON.stringify(snapshot).includes("NEVER EXPORT DRAFT OVERLAY"));
  assert.ok(!JSON.stringify(snapshot).includes(owner.id));
  checks.push(
    "production-only exporter rejects missing auth/site selection and excludes published leads, staged drafts and source owner identity"
  );
  const branch = decodeSeed(
    JSON.parse(readFileSync(path.join(directory, "seed/seed.json"), "utf-8"))
  );
  const pages = branch.collections?.find(
    (collection) => collection.slug === "pages"
  );
  const starter = branch.content?.pages?.find(
    (entry) => entry.slug === "about"
  );
  assert.ok(pages && starter);
  pages.fields.push({
    defaultValue: "Retained branch default",
    label: "Branch note",
    required: true,
    slug: "branch_note",
    type: "string",
  });
  branch.blockTypes?.push({
    currentVersion: 1,
    label: "Branch card",
    slug: "branch_card",
    versions: [
      {
        fields: [
          { label: "Note", required: true, slug: "note", type: "string" },
        ],
        version: 1,
      },
    ],
  });
  const content = pages.fields.find((field) => field.slug === "content");
  assert.ok(
    content?.validation && Array.isArray(content.validation.allowedTypes)
  );
  content.validation.allowedTypes.push("branch_card");
  assert.ok(Array.isArray(starter.data.content));
  starter.data.content.push({
    _key: "branch-card",
    _type: "branch_card",
    _version: 1,
    note: "Retained branch block",
  });
  const plan = composeFreshSeed(branch, snapshot, SITE);
  assert.ok(plan.entries.length > 120);
  await validateFreshPlan(plan);
  writeFileSync(planFile, JSON.stringify({ ...plan, snapshot }));
  writeBuildInputs(directory, {
    contentDigest: publishedContentDigest(directory),
    seedMediaBase: "https://accesselectricinc.com/media",
  });
  writeFileSync(path.join(output, "published-build.log"), build());
  destination = await localWorker(directory, true, {
    publicMediaSource: {
      localOrigin: source.origin,
      publishedOrigin: policy.origin,
    },
  });
  const seeded = await seedStage(
    destination.origin,
    LOCAL_CMS_BOOTSTRAP_TOKEN,
    true
  );
  assert.equal(seeded.seeded, true);
  checks.push("native completion advances beyond 30 rounds and 120 entries");
  const targetDb = await destination.runtime.getD1Database("DB");
  const about = await targetDb
    .prepare("SELECT branch_note,content FROM ec_pages WHERE slug='about'")
    .first<{ branch_note: string; content: string }>();
  assert.equal(about?.branch_note, "Retained branch default");
  assert.ok(about?.content.includes("Retained branch block"));
  const privateRows = await targetDb
    .prepare("SELECT COUNT(*) AS n FROM ec_leads")
    .first<{ n: number }>();
  assert.equal(privateRows?.n, 0);
  const images = await targetDb
    .prepare("SELECT storage_key FROM media WHERE status='ready'")
    .all<{ storage_key: string }>();
  assert.ok(images.results.length > 0);
  const key = images.results[0]?.storage_key;
  assert.ok(key !== undefined && key !== "");
  const original = await request(
    `${destination.origin}/_emdash/api/media/file/${key}`
  );
  assert.equal(original.status, 200);
  const imageHref = `${destination.origin}/_emdash/api/media/file/${key}`;
  const optimized = await request(
    `${destination.origin}/_image?href=${encodeURIComponent(imageHref)}&w=320&f=webp`
  );
  assert.equal(optimized.status, 200, await optimized.clone().text());
  assert.equal(optimized.headers.get("content-type"), "image/webp");
  const bytes = Buffer.from(await optimized.arrayBuffer());
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  writeFileSync(path.join(output, "optimized.webp"), bytes);
  checks.push(
    "fresh native setup downloads production references into destination R2; /_image returns real WebP; branch field and block survive"
  );
  const settingsRow = await targetDb
    .prepare("SELECT value FROM options WHERE name='site:seo'")
    .first<{ value: string }>();
  assert.ok(settingsRow);
  const settingsSeo = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Struct({
        defaultOgImage: Schema.Struct({ mediaId: Schema.String }),
        titleSeparator: Schema.String,
      })
    )
  )(settingsRow.value);
  assert.equal(settingsSeo.titleSeparator, "|");
  assert.notEqual(settingsSeo.defaultOgImage.mediaId, seoMedia.id);
  const seoImageRow = await targetDb
    .prepare("SELECT storage_key FROM media WHERE id=? AND status='ready'")
    .bind(settingsSeo.defaultOgImage.mediaId)
    .first<{ storage_key: string }>();
  assert.ok(seoImageRow);
  const seoImage = await request(
    `${destination.origin}/_emdash/api/media/file/${seoImageRow.storage_key}`
  );
  assert.equal(seoImage.status, 200);
  const seoPage = await request(`${destination.origin}/about`);
  const seoHtml = await seoPage.text();
  assert.ok(
    seoHtml.includes("About Access Electric | Licensed Electrical Contractor")
  );
  assert.ok(
    seoHtml.includes(`/_emdash/api/media/file/${seoImageRow.storage_key}`)
  );
  writeFileSync(path.join(output, "seo-about.html"), seoHtml);
  checks.push(
    "entry and site SEO assets use destination-owned native media; public site SEO and rendered entry SEO survive"
  );
  const receiptBefore = await targetDb
    .prepare("SELECT id,data FROM users")
    .all();
  const repeated = await seedStage(
    destination.origin,
    LOCAL_CMS_BOOTSTRAP_TOKEN,
    true
  );
  assert.equal(repeated.seeded, false);
  const receiptAfter = await targetDb
    .prepare("SELECT id,data FROM users")
    .all();
  assert.deepEqual(receiptAfter.results, receiptBefore.results);
  checks.push(
    "existing stage seeding preserves content and destination owner receipt"
  );
  const relationships = await request(
    `${destination.origin}/portfolio/k-12-schools`
  );
  const relationshipHtml = await relationships.text();
  assert.ok(relationshipHtml.includes(RELATION_TITLE));
  writeFileSync(path.join(output, "relationship.html"), relationshipHtml);
  checks.push(
    "published category relationship resolves to target project ID and renders on its actual page"
  );
  const smokeReport = await smoke({
    cms: true,
    local: false,
    origin: destination.origin,
  });
  writeFileSync(
    path.join(output, "smoke.json"),
    JSON.stringify(smokeReport, null, 2)
  );
  assert.equal(smokeReport.filter((check) => !check.ok).length, 0);
  const seoPassed = await controlCheck({
    flags: ["--content-only"],
    name: "seo",
    origin: destination.origin,
    output,
    site: SITE,
  });
  assert.equal(seoPassed, true);
  checks.push(
    "running production-content Worker passes page/relationship/image smoke and rendered SEO; no form or email requests"
  );
  const freshAgain = await localWorker(directory, true, {
    publicMediaSource: {
      localOrigin: source.origin,
      publishedOrigin: policy.origin,
    },
  });
  try {
    const freshSeed = await seedStage(
      freshAgain.origin,
      LOCAL_CMS_BOOTSTRAP_TOKEN,
      true
    );
    assert.equal(freshSeed.seeded, true);
    const repeatedPage = await request(
      `${freshAgain.origin}/portfolio/k-12-schools`
    );
    const repeatedHtml = await repeatedPage.text();
    assert.ok(repeatedHtml.includes(RELATION_TITLE));
    checks.push(
      "a second fresh native load renders the same semantic relationship"
    );
  } finally {
    await freshAgain.runtime.dispose();
  }
  const sourceKeys = await db
    .prepare("SELECT storage_key FROM media WHERE status='ready' LIMIT 1")
    .first<{ storage_key: string }>();
  assert.ok(sourceKeys);
  const sourceMedia = await source.runtime.getR2Bucket("MEDIA");
  await sourceMedia.delete(sourceKeys.storage_key);
  const missingMedia = await localWorker(directory, true, {
    publicMediaSource: {
      localOrigin: source.origin,
      publishedOrigin: policy.origin,
    },
  });
  try {
    await assert.rejects(
      seedStage(missingMedia.origin, LOCAL_CMS_BOOTSTRAP_TOKEN, true),
      /Native seed missed required media/u
    );
    const incompleteDb = await missingMedia.runtime.getD1Database("DB");
    const owners = await incompleteDb
      .prepare("SELECT COUNT(*) AS n FROM users")
      .first<{ n: number }>();
    assert.equal(owners?.n, 0);
    checks.push(
      "native null media download fails completion explicitly and never provisions the destination owner"
    );
  } finally {
    await missingMedia.runtime.dispose();
  }
  writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify({ checks, passed: true }, null, 2)
  );
  process.stdout.write(
    `${JSON.stringify({ checks, passed: true }, null, 2)}\n`
  );
} finally {
  await destination?.runtime.dispose();
  await source?.runtime.dispose();
  restore(inputsFile, priorInputs);
  restore(planFile, priorPlan);
}
