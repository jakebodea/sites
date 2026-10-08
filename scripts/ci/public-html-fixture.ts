/** Native built-Worker cache + CMS publishing proof. All data is disposable and local. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { Schema } from "effect";

import { request } from "../../packages/control-app/src/http.ts";
import { seedStage } from "../../packages/control-app/src/seed.ts";
import { LOCAL_CMS_BOOTSTRAP_TOKEN, localWorker } from "./local-worker.ts";

const CACHE_HEADER = "x-public-html-cache";
const root = path.resolve(import.meta.dirname, "../..");
const output = path.join(root, ".artifacts/public-html");
mkdirSync(output, { recursive: true });
rmSync(path.join(output, "results.json"), { force: true });
const results: {
  site: string;
  checks: string[];
  missMs: number;
  hitMs: number;
}[] = [];

const fixtureCookie = async (
  worker: Awaited<ReturnType<typeof localWorker>>
) => {
  const db = await worker.runtime.getD1Database("DB");
  const owner = await db
    .prepare("SELECT id,email FROM users")
    .first<{ id: string; email: string }>();
  assert.ok(owner);
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
  const response = await request(
    `${worker.origin}/_emdash/api/auth/magic-link/verify`,
    {
      body: JSON.stringify({ token }),
      headers: { "content-type": "application/json", origin: worker.origin },
      method: "POST",
    }
  );
  assert.equal(response.status, 200);
  return response.headers
    .getSetCookie()
    .map((part) => part.split(";")[0])
    .join("; ");
};

for (const site of ["access-electric", "ms-custom-homes"]) {
  const worker = await localWorker(path.join(root, "apps", site), true, {
    publicHtmlCacheTtl: "2",
    stage: "prod",
  });
  const checks: string[] = [];
  try {
    const seeded = await seedStage(worker.origin, LOCAL_CMS_BOOTSTRAP_TOKEN);
    assert.ok(seeded.seeded, seeded.detail);
    const cookie = await fixtureCookie(worker);
    const started = performance.now();
    const first = await request(`${worker.origin}/about`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get(CACHE_HEADER), "MISS");
    assert.equal(first.headers.get("cache-control"), "no-store");
    const original = await first.text();
    const missMs = performance.now() - started;
    await delay(50);
    const hitStarted = performance.now();
    const second = await request(`${worker.origin}/about`);
    assert.equal(second.headers.get(CACHE_HEADER), "HIT");
    assert.equal(await second.text(), original);
    const hitMs = performance.now() - hitStarted;
    checks.push(
      "anonymous HTML MISS then byte-identical HIT; browser response has no-store"
    );

    const title = `Published cache expiry fixture ${site}`;
    const cmsHeaders = {
      "X-EmDash-Request": "1",
      "content-type": "application/json",
      cookie,
      origin: worker.origin,
    };
    const update = await request(
      `${worker.origin}/_emdash/api/content/pages/about`,
      {
        body: JSON.stringify({ data: { title } }),
        headers: cmsHeaders,
        method: "PUT",
      }
    );
    assert.equal(update.status, 200, await update.clone().text());
    const edited = Schema.decodeUnknownSync(
      Schema.Struct({
        data: Schema.Struct({ item: Schema.Struct({ id: Schema.String }) }),
      })
    )(await update.json());
    const draft = await request(`${worker.origin}/about?audit=draft`);
    const draftHtml = await draft.text();
    assert.ok(
      !draftHtml.includes(title),
      "anonymous request exposed an unpublished draft"
    );
    const publish = await request(
      `${worker.origin}/_emdash/api/content/pages/${edited.data.item.id}/publish`,
      {
        body: "{}",
        headers: cmsHeaders,
        method: "POST",
      }
    );
    assert.equal(publish.status, 200, await publish.clone().text());
    checks.push(
      "unpublished CMS draft stays private and CMS publish succeeds through the uncached write path"
    );

    for (const [route, headers] of [
      ["/about", { cookie }],
      ["/about", { authorization: "Bearer synthetic" }],
      ["/about?audit=1", {}],
      ["/about?preview=1", {}],
      ["/_emdash/admin", {}],
      ["/contact", {}],
      ["/favicon.png", {}],
    ] satisfies readonly (readonly [
      string,
      Readonly<Record<string, string>>,
    ])[]) {
      const response = await request(`${worker.origin}${route}`, { headers });
      assert.equal(
        response.headers.get(CACHE_HEADER),
        null,
        `${route} incorrectly shared a public cache entry`
      );
      await response.arrayBuffer();
    }
    const authenticated = await request(`${worker.origin}/about`, {
      headers: { cookie },
    });
    const authenticatedHtml = await authenticated.text();
    assert.ok(
      authenticatedHtml.includes(title),
      "editor did not see newly published content immediately"
    );
    checks.push(
      "cookie, authorization, query/preview, admin, contact, and static-asset requests bypass shared HTML"
    );

    await delay(2100);
    const refreshed = await request(`${worker.origin}/about`);
    assert.equal(refreshed.headers.get(CACHE_HEADER), "MISS");
    const refreshedHtml = await refreshed.text();
    assert.ok(
      refreshedHtml.includes(title),
      "expired content did not refresh from the published CMS revision"
    );
    await delay(50);
    const refreshedHit = await request(`${worker.origin}/about`);
    assert.equal(refreshedHit.headers.get(CACHE_HEADER), "HIT");
    const refreshedHitHtml = await refreshedHit.text();
    assert.ok(refreshedHitHtml.includes(title));
    checks.push(
      "after the bounded TTL, a fresh MISS and subsequent HIT both show the newly published content"
    );
    await worker.setVersionMetadata(`${site}-next-version`);
    const deployed = await request(`${worker.origin}/about`);
    assert.equal(deployed.headers.get(CACHE_HEADER), "MISS");
    const deployedHtml = await deployed.text();
    assert.ok(deployedHtml.includes(title));
    await delay(50);
    const deployedHit = await request(`${worker.origin}/about`);
    assert.equal(deployedHit.headers.get(CACHE_HEADER), "HIT");
    await deployedHit.arrayBuffer();
    checks.push(
      "a new native version metadata ID starts cold while preserving CMS data"
    );
    results.push({ checks, hitMs, missMs, site });
  } finally {
    await worker.runtime.dispose();
  }

  const preview = await localWorker(path.join(root, "apps", site), true, {
    publicHtmlCacheTtl: "30",
    stage: "pr-999",
  });
  try {
    const seeded = await seedStage(preview.origin, LOCAL_CMS_BOOTSTRAP_TOKEN);
    assert.ok(seeded.seeded, seeded.detail);
    for (let index = 0; index < 2; index += 1) {
      const response = await request(`${preview.origin}/about`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get(CACHE_HEADER), null);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
      await response.arrayBuffer();
    }
    checks.push(
      "nonprod stages remain uncached and noindex even if a nonzero cache TTL is supplied"
    );
  } finally {
    await preview.runtime.dispose();
  }
}
writeFileSync(
  path.join(output, "results.json"),
  `${JSON.stringify({ results, verdict: "PASS" }, null, 2)}\n`
);
process.stdout.write(
  `${JSON.stringify({ results, verdict: "PASS" }, null, 2)}\n`
);
