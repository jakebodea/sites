import { describe, expect, it } from "vitest";

import {
  developmentStage,
  productionDeployRefusal,
  resolveStage,
  stageKind,
} from "./stage.ts";

const site = {
  domain: "example.com",
  id: "example",
  workersSubdomain: "acme",
};

describe(resolveStage, () => {
  it("serves prod from the custom domain", () => {
    expect(resolveStage(site, "prod")).toStrictEqual({
      kind: "production",
      origin: "https://example.com",
      production: true,
      stage: "prod",
      workerName: "example-prod",
    });
  });

  it("serves every other stage from workers.dev", () => {
    expect(resolveStage(site, "pr-42").origin).toBe(
      "https://example-pr-42.acme.workers.dev"
    );
    expect(resolveStage(site, "ae-preview").kind).toBe("named");
  });

  it("rejects stage names Cloudflare cannot use", () => {
    expect(() => resolveStage(site, "Feature/Thing")).toThrow(/Invalid stage/u);
  });
});

describe(stageKind, () => {
  it("classifies stages", () => {
    expect(stageKind("prod")).toBe("production");
    expect(stageKind("pr-7")).toBe("pull-request");
    expect(stageKind("pr-0")).toBe("named");
    expect(stageKind("dev-main")).toBe("development");
  });
});

describe(developmentStage, () => {
  it("derives a stage from the worktree directory", () => {
    expect(developmentStage("sites")).toBe("dev-sites");
    expect(developmentStage("Fix Hero__Slides!")).toBe("dev-fix-hero-slides");
    expect(developmentStage("___")).toBe("dev-local");
  });
});

describe(productionDeployRefusal, () => {
  const prod = resolveStage(site, "prod");

  it("refuses prod outside CI", () => {
    expect(productionDeployRefusal(prod, {})).toMatch(/Refusing/u);
  });

  it("allows prod from CI or with the explicit override", () => {
    expect(productionDeployRefusal(prod, { CI: "true" })).toBeUndefined();
    expect(
      productionDeployRefusal(prod, { ALLOW_PROD_DEPLOY: "1" })
    ).toBeUndefined();
  });

  it("never blocks other stages", () => {
    expect(
      productionDeployRefusal(resolveStage(site, "pr-3"), {})
    ).toBeUndefined();
  });
});
