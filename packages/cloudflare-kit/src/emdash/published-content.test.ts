/* oxlint-disable no-await-in-loop -- Completion rounds depend on the persisted cursor from the preceding round. */
import { readFileSync } from "node:fs";

import {
  ContentRepository,
  OptionsRepository,
  handleContentCreate,
  handleContentGet,
} from "emdash";
import { runMigrations } from "emdash/db";
import { createDialect } from "emdash/db/sqlite";
import { applySeed } from "emdash/seed";
import { Kysely } from "kysely";
import { describe, expect, it } from "vitest";

import {
  authorizedContentRequest,
  completeFresh,
  composeFreshSeed,
  decodeSnapshot,
  contentPolicy,
  decodeSeed,
  exportPublished,
  publicMediaUrl,
} from "./published-content.ts";
import { validateFreshPlan } from "./published-preflight.ts";

type Tables =
  ConstructorParameters<typeof ContentRepository>[0] extends Kysely<infer T>
    ? T
    : never;
const branchSeed = (site = "access-electric") =>
  decodeSeed(
    JSON.parse(
      readFileSync(
        new URL(`../../../../apps/${site}/seed/seed.json`, import.meta.url),
        "utf-8"
      )
    )
  );
const database = async () => {
  const db = new Kysely<Tables>({
    dialect: createDialect({ url: ":memory:" }),
  });
  await runMigrations(db);
  return db;
};

describe("published content", () => {
  it("retains nested branch repeater values by item key and fills new item defaults", () => {
    const branch = branchSeed();
    const gallery = branch.collections
      ?.find((collection) => collection.slug === "projects")
      ?.fields.find((field) => field.slug === "gallery");
    if (!gallery) {
      throw new Error("Fixture lacks gallery");
    }
    gallery.validation = {
      subFields: [
        { label: "Image", slug: "image", type: "image" },
        {
          defaultValue: "Default caption",
          label: "Caption",
          required: true,
          slug: "caption",
          type: "string",
        },
      ],
    };
    const slides = branch.blockTypes
      ?.find((block) => block.slug === "hero")
      ?.versions[0]?.fields.find((field) => field.slug === "slides");
    if (!slides) {
      throw new Error("Fixture lacks hero slides");
    }
    slides.validation = gallery.validation;
    branch.content = {
      pages: [
        {
          data: {
            content: [
              {
                _key: "hero",
                _type: "hero",
                _version: 1,
                headline: "Branch headline",
                slides: [{ _key: "slide", caption: "Branch hero caption" }],
              },
            ],
            title: "About",
          },
          id: "about",
          slug: "about",
          status: "published",
        },
      ],
      projects: [
        {
          data: {
            gallery: [
              {
                _key: "slide",
                caption: "Branch caption",
              },
            ],
            title: "Branch project",
          },
          id: "project",
          slug: "project",
          status: "published",
        },
      ],
    };
    const snapshot = decodeSnapshot({
      entries: [
        {
          collection: "pages",
          data: {
            content: [
              {
                _key: "hero",
                _type: "hero",
                _version: 1,
                headline: "Production headline",
                slides: [{ _key: "slide" }],
              },
            ],
            title: "About",
          },
          locale: "en",
          references: {},
          seo: {
            canonical: null,
            description: null,
            image: null,
            noIndex: false,
            title: null,
          },
          slug: "about",
        },
        {
          collection: "projects",
          data: {
            gallery: [{ _key: "slide" }, { _key: "new" }],
            title: "Production project",
          },
          locale: "en",
          references: {},
          seo: {
            canonical: null,
            description: null,
            image: null,
            noIndex: false,
            title: null,
          },
          slug: "project",
        },
      ],
      menus: [],
      origin: contentPolicy("access-electric").origin,
      settings: {},
      site: "access-electric",
      version: 1,
    });
    const plan = composeFreshSeed(branch, snapshot, "access-electric");
    expect(plan.seed.content?.projects?.[0]?.data.gallery).toStrictEqual([
      {
        _key: "slide",
        caption: "Branch caption",
        image: null,
      },
      { _key: "new", caption: "Default caption", image: null },
    ]);
    expect(
      JSON.stringify(plan.seed.content?.pages?.[0]?.data.content)
    ).toContain("Branch hero caption");
  });

  it("refuses a newer plan before the first completion receipt is written", async () => {
    const target = await database();
    try {
      const snapshot = decodeSnapshot({
        entries: [],
        menus: [],
        origin: contentPolicy("access-electric").origin,
        settings: {},
        site: "access-electric",
        version: 1,
      });
      const plan = composeFreshSeed(branchSeed(), snapshot, "access-electric");
      await applySeed(target, plan.seed, {
        includeContent: true,
        skipMediaDownload: true,
      });
      await new OptionsRepository(target).set("emdash:setup_state", {
        step: "site_complete",
      });
      await expect(
        completeFresh(
          target,
          { ...plan, identity: crypto.randomUUID() },
          "dev-fixture",
          "access-electric"
        )
      ).rejects.toThrow(
        "Native seed belongs to another published content plan"
      );
    } finally {
      await target.destroy();
    }
  });

  // Three native SQLite migration/setup cycles exceed the unit-test deadline on shared CI runners.
  it(
    "exports live public rows and restores semantic relationships/SEO while retaining branch additions",
    { timeout: 15_000 },
    async () => {
      const source = await database();
      const target = await database();
      try {
        const branch = branchSeed();
        await applySeed(source, {
          blockTypes: branch.blockTypes,
          collections: branch.collections,
          relations: branch.relations,
          version: "1",
        });
        const category = await handleContentCreate(source, "categories", {
          data: { title: "Schools" },
          slug: "schools",
          status: "published",
        });
        const project = await handleContentCreate(source, "projects", {
          data: { progress: "completed", title: "School one" },
          slug: "school-one",
          status: "published",
        });
        if (!category.success || !project.success) {
          throw new Error("Fixture creation failed");
        }
        await handleContentCreate(source, "pages", {
          data: { content: [], title: "Production about" },
          seo: { description: "Published description", title: "Published SEO" },
          slug: "about",
          status: "published",
        });
        await handleContentCreate(source, "pages", {
          data: { title: "Private draft" },
          slug: "private-draft",
        });
        await handleContentCreate(source, "leads", {
          data: {
            email: "private@example.test",
            message: "Private lead",
            title: "Private published lead",
          },
          slug: "private-lead",
          status: "published",
        });
        // Public side-write fixture models the already-published live selection.
        const { handleContentUpdate } = await import("emdash");
        await handleContentUpdate(source, "categories", category.data.item.id, {
          references: { projects: [project.data.item.id] },
        });
        await new OptionsRepository(source).set("plugin:private", {
          secret: "source-secret",
        });
        await new OptionsRepository(source).set("studio:published-content", {
          receipt: "source-receipt",
        });
        const snapshot = await exportPublished(source, "access-electric", {
          menus: [
            {
              items: [
                { label: "Schools", type: "custom", url: "/portfolio/schools" },
              ],
              label: "Primary",
              name: "primary",
            },
          ],
          settings: { tagline: "Published tagline", title: "Published title" },
        });
        const serialized = JSON.stringify(snapshot);
        expect(
          [
            "private@example.test",
            "Private draft",
            "source-secret",
            "source-receipt",
            project.data.item.id,
          ].filter((value) => serialized.includes(value))
        ).toStrictEqual([]);
        const pages = branch.collections?.find(
          (collection) => collection.slug === "pages"
        );
        if (!pages) {
          throw new Error("Fixture lacks pages");
        }
        pages.fields.push({
          defaultValue: "Branch default",
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
        const blocks = pages.fields.find((field) => field.slug === "content");
        if (
          !blocks?.validation ||
          !Array.isArray(blocks.validation.allowedTypes)
        ) {
          throw new Error("Fixture lacks blocks");
        }
        blocks.validation.allowedTypes.push("branch_card");
        const starter = branch.content?.pages?.find(
          (row) => row.slug === "about"
        );
        if (!starter) {
          throw new Error("Fixture lacks starter");
        }
        starter.data.branch_note = "Branch starter";
        starter.data.content = [
          {
            _key: "branch",
            _type: "branch_card",
            _version: 1,
            note: "Branch block",
          },
        ];
        branch.content = { pages: [starter] };
        const plan = composeFreshSeed(branch, snapshot, "access-electric");
        await validateFreshPlan(plan);
        await applySeed(target, plan.seed, {
          includeContent: true,
          skipMediaDownload: true,
        });
        await new OptionsRepository(target).set("emdash:setup_state", {
          step: "site_complete",
        });
        let result = await completeFresh(
          target,
          plan,
          "dev-fixture",
          "access-electric"
        );
        while (!result.complete) {
          result = await completeFresh(
            target,
            plan,
            "dev-fixture",
            "access-electric"
          );
        }
        const about = await handleContentGet(target, "pages", "about", "en", {
          includeDrafts: false,
        });
        const schools = await handleContentGet(
          target,
          "categories",
          "schools",
          "en",
          { includeDrafts: false }
        );
        if (!about.success || !schools.success) {
          throw new Error("Imported rows absent");
        }
        const leads = await new ContentRepository(target).findMany("leads");
        expect({
          blocks: about.data.item.data.content,
          leads: leads.items,
          note: about.data.item.data.branch_note,
          projects: schools.data.item.references?.projects?.children.map(
            (entry) => entry.slug
          ),
          seo: about.data.item.seo?.title,
          tokens: await target.selectFrom("auth_tokens").selectAll().execute(),
          users: await target.selectFrom("users").selectAll().execute(),
        }).toStrictEqual({
          blocks: [
            {
              _key: "branch",
              _type: "branch_card",
              _version: 1,
              note: "Branch block",
            },
          ],
          leads: [],
          note: "Branch starter",
          projects: ["school-one"],
          seo: "Published SEO",
          tokens: [],
          users: [],
        });
        const before = await target
          .selectFrom("revisions")
          .selectAll()
          .execute();
        const repeated = await completeFresh(
          target,
          plan,
          "dev-fixture",
          "access-electric"
        );
        expect({
          repeated,
          revisions: await target.selectFrom("revisions").selectAll().execute(),
        }).toStrictEqual({
          repeated: {
            complete: true,
            index: plan.entries.length,
            total: plan.entries.length,
          },
          revisions: before,
        });
        await expect(
          completeFresh(target, plan, "prod", "access-electric")
        ).rejects.toThrow("Destination stage/site mismatch");
        await expect(
          completeFresh(target, plan, "pr-3", "ms-custom-homes")
        ).rejects.toThrow("Destination stage/site mismatch");
      } finally {
        await source.destroy();
        await target.destroy();
      }
    }
  );

  it.each(["access-electric", "ms-custom-homes"] as const)(
    "exports only the approved collections for %s",
    async (site) => {
      const db = await database();
      try {
        const seed = branchSeed(site);
        await applySeed(db, {
          blockTypes: seed.blockTypes,
          collections: seed.collections,
          relations: seed.relations,
          version: "1",
        });
        await handleContentCreate(db, "pages", {
          data: { content: [], title: "Public page" },
          slug: "public-page",
          status: "published",
        });
        await handleContentCreate(db, "leads", {
          data: {
            email: "private@example.test",
            message: "Private",
            title: "Private lead",
          },
          slug: "published-lead",
          status: "published",
        });
        await handleContentCreate(db, "pages", {
          data: { content: [], title: "Draft page" },
          slug: "draft-page",
        });
        const result = await exportPublished(db, site, {
          menus: [],
          settings: {},
        });
        expect(
          result.entries.map((entry) => ({
            collection: entry.collection,
            slug: entry.slug,
            title: entry.data.title,
          }))
        ).toStrictEqual([
          { collection: "pages", slug: "public-page", title: "Public page" },
        ]);
      } finally {
        await db.destroy();
      }
    }
  );

  it("normalizes native MS published project boolean columns without accepting unrelated fields", async () => {
    const db = await database();
    try {
      const seed = branchSeed("ms-custom-homes");
      const projects = seed.collections?.find(
        (collection) => collection.slug === "projects"
      );
      if (projects === undefined) {
        throw new Error("Missing MS projects fixture");
      }
      projects.fields.push({
        label: "Private note",
        slug: "private_note",
        type: "text",
      });
      await applySeed(db, {
        blockTypes: seed.blockTypes,
        collections: seed.collections,
        version: "1",
      });
      const created = await handleContentCreate(db, "projects", {
        data: {
          featured: true,
          private_note: "Excluded",
          title: "Public home",
        },
        slug: "public-home",
        status: "published",
      });
      if (!created.success) {
        throw new Error(`Native fixture failed: ${created.error.code}`);
      }
      const snapshot = await exportPublished(db, "ms-custom-homes", {
        menus: [],
        settings: {},
      });
      expect({
        featured: snapshot.entries[0]?.data.featured,
        serialized: JSON.stringify(snapshot).includes("Excluded"),
      }).toStrictEqual({ featured: true, serialized: false });
    } finally {
      await db.destroy();
    }
  });

  it("rejects incompatible schema, missing required fields, and unsupported retained block versions before activation", async () => {
    const branch = branchSeed();
    branch.content = {};
    const snapshot = decodeSnapshot({
      entries: [
        {
          collection: "pages",
          data: { content: [], title: "Public" },
          locale: "en",
          references: {},
          seo: {
            canonical: null,
            description: null,
            image: null,
            noIndex: false,
            title: null,
          },
          slug: "about",
        },
      ],
      menus: [],
      origin: contentPolicy("access-electric").origin,
      settings: {},
      site: "access-electric",
      version: 1,
    });
    const fields = branch.collections?.find(
      (collection) => collection.slug === "pages"
    )?.fields;
    if (fields === undefined) {
      throw new Error("Missing fixture fields");
    }
    fields.push({
      label: "Required",
      required: true,
      slug: "required_branch",
      type: "string",
    });
    await expect(
      validateFreshPlan(composeFreshSeed(branch, snapshot, "access-electric"))
    ).rejects.toThrow("required_branch");
    fields.pop();
    const title = fields.find((field) => field.slug === "title");
    if (title === undefined) {
      throw new Error("Missing fixture title");
    }
    title.type = "integer";
    expect(() => composeFreshSeed(branch, snapshot, "access-electric")).toThrow(
      "incompatible field type"
    );
    title.type = "string";
    const versioned = decodeSnapshot({
      ...snapshot,
      entries: [
        {
          ...snapshot.entries[0],
          data: {
            content: [{ _key: "bad", _type: "content", _version: 99 }],
            title: "Public",
          },
        },
      ],
    });
    expect(() =>
      composeFreshSeed(branch, versioned, "access-electric")
    ).toThrow("no retained branch version");
    expect(() =>
      composeFreshSeed(
        branch,
        { ...snapshot, site: "ms-custom-homes" },
        "access-electric"
      )
    ).toThrow("Published source/site mismatch");
  });

  it("refuses auth/stage/source mismatches and arbitrary media URLs", () => {
    const token = "synthetic-export-credential-00000000000001";
    const request = new Request("https://example.test/_content/published", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      authorizedContentRequest(
        request,
        { PUBLISHED_CONTENT_EXPORT_TOKEN: token, STAGE: "prod" },
        "export"
      )
    ).toBeTruthy();
    expect(
      authorizedContentRequest(
        request,
        { PUBLISHED_CONTENT_EXPORT_TOKEN: token, STAGE: "pr-3" },
        "export"
      )
    ).toBeFalsy();
    expect(
      authorizedContentRequest(request, { STAGE: "prod" }, "export")
    ).toBeFalsy();
    for (const stage of ["prod", "preview", "pr-0"]) {
      expect(
        authorizedContentRequest(
          new Request("https://example.test", {
            headers: { "x-cms-bootstrap-token": token },
          }),
          { CMS_BOOTSTRAP_TOKEN: token, STAGE: stage },
          "complete"
        )
      ).toBeFalsy();
    }
    expect(() =>
      publicMediaUrl("https://untrusted.test/photo.jpg", "https://source.test")
    ).toThrow("Media must belong");
    expect(() =>
      publicMediaUrl(
        "https://source.test/private/photo.jpg",
        "https://source.test"
      )
    ).toThrow("Media must belong");
  });
});
