/**
 * Test-quality oxlint JS plugin.
 *
 * A test earns its place only if it would fail when the code under test does nothing: call the
 * code the way its users do and assert what they observe against a literal expected value from
 * an independent source. These rules catch the shapes that pass anyway. Built-in rules already
 * cover the rest: `vitest/expect-expect` (no assertion) and `anti-slop/no-module-mocking`
 * (mocking the project's own modules). Each rule has a unit test in
 * `oxlint-plugin-test-quality.test.ts`.
 *
 * Test blocks are `it`/`test` and everything chained off them, so `it.each(rows)(...)`,
 * `it.skip(...)` and @effect/vitest's `it.effect`/`it.live`/`it.scoped` all count. In an Effect
 * test the callback returns `Effect.gen(function* () { ... })`: the `Effect.gen` wrapper itself
 * runs nothing, but a `yield*` inside it does.
 */
import { definePlugin, defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const TEST_NAMES = new Set(["it", "test"]);

/**
 * Matchers that pin no produced value: presence, absence, or type. `toBeNull`, empty results, and
 * positive call assertions on an injected callback stay out: a subject that does nothing fails them.
 */
const WEAK_MATCHERS = new Set([
  "toBeDefined",
  "toBeUndefined",
  "toBeInstanceOf",
  "toBeTypeOf",
]);

/** Bounds, which pin nothing when the bound is zero (`toBeGreaterThan(0)`). */
const BOUND_MATCHERS = new Set([
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeLessThan",
  "toBeLessThanOrEqual",
]);

/** Matchers whose argument is the expected value. */
const EXPECTED_VALUE_MATCHERS = new Set([
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toMatchObject",
  "toContain",
  "toContainEqual",
  "toHaveProperty",
]);

/** Keys that hold parents or positions rather than child nodes. */
const NON_CHILD_KEYS = new Set(["parent", "loc", "range", "start", "end"]);

/** Roots whose calls are test tooling, not the code under test. */
const NON_SUBJECT_ROOTS = new Set(["vi", "expect"]);

/** Non-call nodes that run code: construction, `await`, tagged templates, and `yield*` in Effect tests. */
const RUNS_CODE_NODES = new Set([
  "NewExpression",
  "AwaitExpression",
  "TaggedTemplateExpression",
  "YieldExpression",
]);

const CUSTOM_ASSERTION_NAME = /^(?:expect|assert)[A-Z]/u;

/** A node of any type; children are found by walking its object-valued keys. */
type AnyNode = ESTree.Node;

type Callee = ESTree.Node | null | undefined;

interface Expectation {
  matcher: string;
  negated: boolean;
  actual: ESTree.Node | undefined;
  expected: readonly ESTree.Node[];
}

interface TestScan {
  expectations: Expectation[];
  customAssertion: boolean;
  typeOnly: boolean;
  runsCode: boolean;
}

const isNode = (value: unknown): value is AnyNode =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- AST property values are untyped; this is the node guard.
  value !== null && typeof value === "object" && "type" in value;

/**
 * Every child node of an ESTree node.
 * @yields {AnyNode} each node-valued property, and each node in an array-valued property
 */
const childrenOf = function* childrenOf(node: AnyNode): Generator<AnyNode> {
  for (const [key, value] of Object.entries(node)) {
    if (NON_CHILD_KEYS.has(key)) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      if (isNode(item)) {
        yield item;
      }
    }
  }
};

/** The name a callee is called by: `f()` is `f`, `a.b.f()` is `f`. */
const calleeName = (callee: Callee): string | null => {
  if (callee?.type === "Identifier") {
    return callee.name;
  }
  if (
    callee?.type === "MemberExpression" &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
};

/** The identifier at the root of a callee chain: `it.each(rows)(...)` and `it.skip(...)` are `it`. */
const rootName = (node: Callee): string | null => {
  let current = node;
  while (current) {
    if (current.type === "Identifier") {
      return current.name;
    }
    if (current.type === "MemberExpression") {
      current = current.object;
    } else if (current.type === "CallExpression") {
      current = current.callee;
    } else {
      return null;
    }
  }
  return null;
};

/** The body of a test case, when `node` declares one. */
const testCallback = (node: ESTree.CallExpression) => {
  if (!TEST_NAMES.has(rootName(node.callee) ?? "")) {
    return null;
  }
  const callback = node.arguments.at(-1);
  return callback?.type === "ArrowFunctionExpression" ||
    callback?.type === "FunctionExpression"
    ? callback
    : null;
};

/** `Effect.gen(function* () { ... })` only builds the program; the `yield*` inside it runs code. */
const isEffectGen = (root: string | null, name: string | null) =>
  root === "Effect" && name === "gen";

/** Reads `expect(actual)[.not|.resolves|.rejects…].matcher(args)` from the outermost call. */
const readExpectation = (node: ESTree.CallExpression): Expectation | null => {
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.property.type !== "Identifier"
  ) {
    return null;
  }
  const matcher = node.callee.property.name;
  let negated = false;
  let current: ESTree.Node = node.callee.object;
  while (current.type === "MemberExpression") {
    if (
      current.property.type === "Identifier" &&
      current.property.name === "not"
    ) {
      negated = true;
    }
    current = current.object;
  }
  if (
    current.type !== "CallExpression" ||
    rootName(current.callee) !== "expect" ||
    calleeName(current.callee) === "expectTypeOf"
  ) {
    return null;
  }
  return {
    actual: current.arguments[0],
    expected: node.arguments,
    matcher,
    negated,
  };
};

/** An expectation that pins no produced value: negated, a weak matcher, or a zero bound. */
const isWeak = ({ matcher, negated, expected }: Expectation) => {
  const [bound] = expected;
  const zeroBound =
    BOUND_MATCHERS.has(matcher) &&
    bound?.type === "Literal" &&
    bound.value === 0;
  return negated || WEAK_MATCHERS.has(matcher) || zeroBound;
};

/**
 * Expectations and code calls in a test body. A call inside an expected value does not count
 * as running the code; neither do `vi.*`/`expect.*` helpers, the `Effect.gen` wrapper, or the
 * matchers themselves.
 */
const scanTest = (body: AnyNode): TestScan => {
  const scan: TestScan = {
    customAssertion: false,
    expectations: [],
    runsCode: false,
    typeOnly: false,
  };

  const visit = (node: AnyNode, inExpected: boolean) => {
    if (node.type === "CallExpression") {
      const expectation = readExpectation(node);
      if (expectation !== null) {
        scan.expectations.push(expectation);
        if (expectation.actual) {
          visit(expectation.actual, false);
        }
        for (const argument of expectation.expected) {
          visit(argument, true);
        }
        return;
      }
      const name = calleeName(node.callee);
      const root = rootName(node.callee);
      if (name === "expectTypeOf" || root === "expectTypeOf") {
        scan.typeOnly = true;
      } else if (name !== null && CUSTOM_ASSERTION_NAME.test(name)) {
        scan.customAssertion = true;
      } else if (
        !inExpected &&
        !NON_SUBJECT_ROOTS.has(root ?? "") &&
        !isEffectGen(root, name)
      ) {
        scan.runsCode = true;
      }
    } else if (!inExpected && RUNS_CODE_NODES.has(node.type)) {
      scan.runsCode = true;
    }
    for (const child of childrenOf(node)) {
      visit(child, inExpected);
    }
  };

  visit(body, false);
  return scan;
};

/** Report each test case whose scan fails `check`. */
const forEachTest = (
  check: (scan: TestScan, test: ESTree.CallExpression) => void
) => ({
  CallExpression(node: ESTree.CallExpression) {
    const callback = testCallback(node);
    if (callback === null || !callback.body) {
      return;
    }
    const scan = scanTest(callback.body);
    if (
      scan.typeOnly ||
      scan.customAssertion ||
      scan.expectations.length === 0
    ) {
      return;
    }
    check(scan, node);
  },
});

export const noWeakOnlyAssertionsRule = defineRule({
  create(context) {
    return forEachTest(({ expectations }, test) => {
      if (expectations.every(isWeak)) {
        context.report({ messageId: "weakOnly", node: test });
      }
    });
  },
  meta: {
    docs: {
      description:
        "Require each test to pin at least one produced value or effect, not only presence, absence, type, or a bound of zero.",
    },
    messages: {
      weakOnly:
        "Every assertion in this test would still pass if the code did nothing useful (`toBeUndefined`, `.not`, `toBeDefined`, `toBeInstanceOf`, or a bound of zero). Add an assertion on a literal produced value or effect, e.g. pair the absence with a presence check on another input.",
    },
    schema: [],
    type: "problem",
  },
});

export const requireSubjectCallRule = defineRule({
  create(context) {
    return forEachTest(({ runsCode }, test) => {
      if (!runsCode) {
        context.report({ messageId: "noSubjectCall", node: test });
      }
    });
  },
  meta: {
    docs: {
      description:
        "Require each test to run code: a test that only reads constants or data it built itself cannot fail for a defect.",
    },
    messages: {
      noSubjectCall:
        "This test runs no code: it only reads constants, config rows, or data it built itself, so it cannot fail for a defect. Call the code that reads the value with one input and assert what it produces, or delete the test.",
    },
    schema: [],
    type: "problem",
  },
});

/** The module a test file covers: `people-service.test.ts` covers `people-service`. */
const subjectBasename = (filename: string) =>
  filename
    .split("/")
    .at(-1)
    ?.replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/u, "") ?? "";

/** Whether an import specifier names the test's own subject module. */
const importsSubject = (source: string, subject: string) =>
  subject !== "" &&
  source
    .replace(/\.[cm]?[jt]sx?$/u, "")
    .split("/")
    .at(-1) === subject;

/** The first call anywhere inside `node` to a name in `names`. */
const findCallTo = (
  node: AnyNode,
  names: Set<string>
): ESTree.CallExpression | null => {
  if (
    node.type === "CallExpression" &&
    names.has(calleeName(node.callee) ?? "")
  ) {
    return node;
  }
  for (const child of childrenOf(node)) {
    const found = findCallTo(child, names);
    if (found !== null) {
      return found;
    }
  }
  return null;
};

export const noSelfReferentialExpectedRule = defineRule({
  create(context) {
    const subject = subjectBasename(context.filename);
    /** Local names bound to the subject module's exports. */
    const subjectNames = new Set<string>();
    const { sourceCode } = context;

    return {
      ImportDeclaration(node) {
        if (
          node.importKind === "type" ||
          !importsSubject(node.source.value, subject)
        ) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (!("importKind" in specifier) || specifier.importKind !== "type") {
            subjectNames.add(specifier.local.name);
          }
        }
      },
      ...forEachTest(({ expectations }) => {
        /** Expected values the module under test computed, while no other assertion is independent. */
        const computed: ESTree.CallExpression[] = [];
        let independent = false;
        for (const { matcher, actual, expected } of expectations) {
          const [first] = expected;
          if (EXPECTED_VALUE_MATCHERS.has(matcher) && first !== undefined) {
            if (
              actual !== undefined &&
              sourceCode.getText(actual) === sourceCode.getText(first)
            ) {
              context.report({ messageId: "sameExpression", node: first });
            } else {
              const call = findCallTo(first, subjectNames);
              if (call === null) {
                independent = true;
              } else {
                computed.push(call);
              }
            }
          }
        }
        // One literal anchor (`expect(url("a")).toBe("/a")`) makes the computed comparisons
        // relations against verified behavior rather than restatements of it.
        if (!independent) {
          for (const call of computed) {
            context.report({
              data: { name: calleeName(call.callee) ?? "" },
              messageId: "selfReferential",
              node: call,
            });
          }
        }
      }),
    };
  },
  meta: {
    docs: {
      description:
        "Disallow computing a test's expected value with the module under test: the assertion then passes by construction.",
    },
    messages: {
      sameExpression:
        "The expected value is the same expression as the actual value, so this assertion passes by construction.",
      selfReferential:
        "The expected value calls `{{name}}` from the module under test, and no assertion in this test checks a literal, so it is computed the way the code computes it and cannot disagree with it. Write the expected value as a literal from a worked example or the spec, or anchor it with one literal assertion.",
    },
    schema: [],
    type: "problem",
  },
});

export default definePlugin({
  meta: { name: "test-quality" },
  rules: {
    "no-self-referential-expected": noSelfReferentialExpectedRule,
    "no-weak-only-assertions": noWeakOnlyAssertionsRule,
    "require-subject-call": requireSubjectCallRule,
  },
});
