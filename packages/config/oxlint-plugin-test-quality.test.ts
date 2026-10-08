import { RuleTester } from "oxlint/plugins-dev";
import { describe, test } from "vitest";

import {
  noSelfReferentialExpectedRule,
  noWeakOnlyAssertionsRule,
  requireSubjectCallRule,
} from "./oxlint-plugin-test-quality.ts";

RuleTester.describe = describe;
RuleTester.it = test;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: "ts",
    },
  },
});

ruleTester.run("no-weak-only-assertions", noWeakOnlyAssertionsRule, {
  invalid: [
    {
      code: `it.effect("ignores invalid payloads", () =>
          Effect.gen(function* () {
            const result = yield* readEffect("bad");
            expect(result).toBeUndefined();
          }));`,
      errors: [{ messageId: "weakOnly" }],
      name: "absence only inside it.effect",
    },
    {
      code: `it("ignores invalid payloads", () => {
          expect(read("bad")).toBeUndefined();
        });`,
      errors: [{ messageId: "weakOnly" }],
      name: "absence only",
    },
    {
      code: `it.each(rows)("parses %s", (row) => {
          expect(parse(row)).toBeDefined();
          expect(parse(row)).toBeInstanceOf(Plan);
          expect(() => parse(row)).not.toThrow();
        });`,
      errors: [{ messageId: "weakOnly" }],
      name: "negations, presence, and type only",
    },
    {
      code: `test("scores matches", async () => {
          expect(await score("a")).toBeGreaterThan(0);
        });`,
      errors: [{ messageId: "weakOnly" }],
      name: "a bound of zero",
    },
  ],
  valid: [
    {
      code: `it.effect("reads only its own key", () =>
          Effect.gen(function* () {
            expect(yield* readEffect("a")).toBe(1);
            expect(yield* readEffect("b")).toBeUndefined();
          }));`,
      name: "absence paired with a literal presence inside it.effect",
    },
    {
      code: `it("reads only its own key", () => {
          expect(read("a")).toBe(1);
          expect(read("b")).toBeUndefined();
        });`,
      name: "absence paired with a literal presence",
    },
    {
      code: `it("finds nothing", () => {
          expect(find("x")).toBeNull();
          expect(list("x")).toStrictEqual([]);
        });`,
      name: "null and empty results fail when the subject returns undefined",
    },
    {
      code: `it("clears after four seconds", () => {
          clearLater(clear);
          expect(clear).not.toHaveBeenCalled();
          expect(clear).toHaveBeenCalledOnce();
        });`,
      name: "a positive call on an injected callback is an effect",
    },
    {
      code: `it("never exceeds the width", () => {
          expect(measure(truncate(text, 40))).toBeLessThanOrEqual(40);
        });`,
      name: "a non-zero bound is an invariant",
    },
    {
      code: `it("round-trips", () => {
          expectRoundTrip(value);
          expect(value).toBeDefined();
        });`,
      name: "custom assertion helpers are trusted",
    },
    {
      code: `it("types the reply", () => {
          expectTypeOf(reply).toEqualTypeOf<Reply>();
          expect(reply).toBeDefined();
        });`,
      name: "type-only tests are compile-time checks",
    },
  ],
});

ruleTester.run("require-subject-call", requireSubjectCallRule, {
  invalid: [
    {
      code: `it.effect("lists twenty-four keys", () =>
          Effect.gen(function* () {
            expect(CHORD_KEYS).toHaveLength(24);
          }));`,
      errors: [{ messageId: "noSubjectCall" }],
      name: "an Effect.gen wrapper without yield* runs no code",
    },
    {
      code: `it("lists twenty-four keys", () => {
          expect(CHORD_KEYS).toHaveLength(24);
          expect(LIMITS.max).toBe(8);
        });`,
      errors: [{ messageId: "noSubjectCall" }],
      name: "constant pin",
    },
    {
      code: `it("blocks probes", () => {
          expect(rule.expression).toBe(paths.map((path) => path).join(" or "));
        });`,
      errors: [{ messageId: "noSubjectCall" }],
      name: "calls only inside the expected value",
    },
  ],
  valid: [
    {
      code: `it.live("loads", () =>
          Effect.gen(function* () {
            const plan = yield* loadPlan("p1");
            expect(plan.id).toBe("p1");
          }));
        it.scoped("loads in a scope", () =>
          Effect.gen(function* () {
            expect((yield* loadPlan("p1")).id).toBe("p1");
          }));`,
      name: "yield* in it.live and it.scoped runs code",
    },
    {
      code: `it("slugifies", () => {
          expect(slugify("Hello, World!")).toBe("hello-world");
        });`,
      name: "calls the subject inside expect",
    },
    {
      code: `it("loads", async () => {
          const plan = await loadPlan("p1");
          expect(plan.id).toBe("p1");
        });`,
      name: "awaits the subject",
    },
    {
      code: `it("names every key once", () => {
          expect(new Set(KEYS).size).toBe(KEYS.length);
        });`,
      name: "a relation across table rows runs code",
    },
  ],
});

ruleTester.run("no-self-referential-expected", noSelfReferentialExpectedRule, {
  invalid: [
    {
      code: `import { exchange, sessionToken } from "./demo";
        it.effect("exchanges the key", () =>
          Effect.gen(function* () {
            expect(yield* exchange("k")).toBe(yield* sessionToken("k"));
          }));`,
      errors: [{ messageId: "selfReferential" }],
      filename: "/repo/src/demo.test.ts",
      name: "expected value computed by the module under test inside it.effect",
    },
    {
      code: `import { exchange, sessionToken } from "./demo";
        it("exchanges the key", async () => {
          expect(await exchange("k")).toBe(await sessionToken("k"));
        });`,
      errors: [{ messageId: "selfReferential" }],
      filename: "/repo/src/demo.test.ts",
      name: "expected value computed by the module under test",
    },
    {
      code: `import { format, parse } from "@pcobooster/contracts/client-version";
        it("reads the header", () => {
          expect(parse(format("web"))).toStrictEqual(parse(format("web")));
        });`,
      errors: [{ messageId: "sameExpression" }],
      filename: "/repo/packages/api/src/client-version.test.ts",
      name: "subject imported through a package path",
    },
  ],
  valid: [
    {
      code: `import { exchange } from "./demo";
        it.effect("exchanges the key", () =>
          Effect.gen(function* () {
            expect(yield* exchange("k")).toBe("2f1c");
          }));`,
      filename: "/repo/src/demo.test.ts",
      name: "literal expected value inside it.effect",
    },
    {
      code: `import { exchange } from "./demo";
        it("exchanges the key", async () => {
          expect(await exchange("k")).toBe("2f1c");
        });`,
      filename: "/repo/src/demo.test.ts",
      name: "literal expected value",
    },
    {
      code: `import { assetUrl, links } from "./site-head";
        it("serves the icon from the asset prefix", () => {
          expect(links()).toStrictEqual([{ href: assetUrl("icon.svg") }]);
          expect(assetUrl("icon.svg")).toBe("/marketing/icon.svg");
        });`,
      filename: "/repo/src/site-head.test.ts",
      name: "a literal anchor makes the computed comparison a relation",
    },
    {
      code: `import { readPlans } from "./plans";
        import { planFixture } from "./testing/fixtures";
        it("reads plans", () => {
          expect(readPlans()).toStrictEqual([planFixture("p1")]);
        });`,
      filename: "/repo/src/plans.test.ts",
      name: "helpers from other modules build expected values",
    },
  ],
});
