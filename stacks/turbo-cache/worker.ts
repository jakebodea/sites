/**
 * A Turborepo remote cache on a Worker + R2, so CI and every agent worktree
 * share build outputs. Implements the endpoints `turbo` calls
 * (https://turborepo.com/docs/core-concepts/remote-caching#self-hosting):
 * artifact GET/HEAD/PUT, cache status, and analytics events (accepted, ignored).
 */

interface Env {
  readonly ARTIFACTS: R2Bucket;
  readonly TURBO_TOKEN: string;
}

const ARTIFACT_PATH = /^\/v8\/artifacts\/(?<hash>[a-zA-Z0-9]+)$/u;

interface CacheResponseBody {
  readonly error?: string;
  readonly status?: string;
  readonly urls?: readonly string[];
}

const json = (body: CacheResponseBody, status = 200) =>
  Response.json(body, { status });

const authorized = (request: Request, env: Env): boolean =>
  request.headers.get("authorization") === `Bearer ${env.TURBO_TOKEN}`;

/** Artifacts are namespaced by team (`--team` / `TURBO_TEAM`), so one cache can serve several repos. */
const artifactKey = (url: URL, hash: string): string =>
  `${url.searchParams.get("slug") ?? url.searchParams.get("teamId") ?? "default"}/${hash}`;

const artifact = async (
  request: Request,
  env: Env,
  key: string
): Promise<Response> => {
  if (request.method === "PUT") {
    await env.ARTIFACTS.put(key, request.body, {
      customMetadata: { tag: request.headers.get("x-artifact-tag") ?? "" },
    });
    return json({ urls: [] }, 202);
  }
  const object = await env.ARTIFACTS.get(key);
  if (object === null) {
    return json({ error: "not found" }, 404);
  }
  const headers = new Headers({ "content-type": "application/octet-stream" });
  const tag = object.customMetadata?.tag ?? "";
  if (tag !== "") {
    headers.set("x-artifact-tag", tag);
  }
  return new Response(request.method === "HEAD" ? null : object.body, {
    headers,
  });
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!authorized(request, env)) {
      return json({ error: "unauthorized" }, 401);
    }
    if (url.pathname === "/v8/artifacts/status") {
      return json({ status: "enabled" });
    }
    if (url.pathname === "/v8/artifacts/events") {
      return json({});
    }
    const hash = ARTIFACT_PATH.exec(url.pathname)?.groups?.hash;
    return hash === undefined
      ? json({ error: "not found" }, 404)
      : await artifact(request, env, artifactKey(url, hash));
  },
} satisfies ExportedHandler<Env>;
