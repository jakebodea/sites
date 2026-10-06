/**
 * Project-local oxlint JS plugin: marketing-site conventions no upstream preset
 * covers. Each rule has a unit test in `oxlint-plugin-local.test.ts`.
 *
 * Oxlint parses `.ts`/`.tsx` files and the frontmatter/scripts of `.astro`
 * files, not Astro template markup; `check-copy.ts` covers copy there and in
 * the EmDash seed.
 */
import { definePlugin, defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

/** Em dash and en dash. A hyphen, comma, colon, or parentheses read better in UI copy. */
export const LONG_DASH = /[–—]/u;

const TRANSITION_COLORS_CLASS = /(?:^|\s|:)transition-colors(?:\s|$)/u;
const SHARED_UI_DIRECTORY = "/components/ui/";
const CLASS_ATTRIBUTES = new Set(["class", "className"]);
const CLASS_FUNCTIONS = new Set(["cn", "cva", "clsx", "twMerge"]);

/** Native controls and the shared primitive that owns their look. */
const SHARED_CONTROL_REPLACEMENTS = new Map([
  ["button", "`<Button>`"],
  ["input", "`<Input>`"],
  ["select", "`<NativeSelect>` or `<Select>`"],
  ["textarea", "`<Textarea>`"],
]);

type ClassNode =
  | ESTree.Expression
  | ESTree.JSXAttributeValue
  | ESTree.JSXEmptyExpression
  | ESTree.SpreadElement
  | ESTree.ObjectPropertyKind
  | ESTree.PropertyKey
  | null;

/** Static text of a class expression: literals, template quasis, and helper arguments. */
const classText = (node: ClassNode): string => {
  if (node === null) {
    return "";
  }
  if (node.type === "Literal") {
    return String(node.value);
  }
  if (node.type === "JSXExpressionContainer") {
    return classText(node.expression);
  }
  if (node.type === "TemplateLiteral") {
    return node.quasis.map((quasi) => quasi.value.cooked ?? "").join(" ");
  }
  if (node.type === "CallExpression") {
    return node.arguments.map(classText).join(" ");
  }
  if (node.type === "ConditionalExpression") {
    return `${classText(node.consequent)} ${classText(node.alternate)}`;
  }
  if (node.type === "LogicalExpression") {
    return `${classText(node.left)} ${classText(node.right)}`;
  }
  if (node.type === "ArrayExpression") {
    return node.elements.map(classText).join(" ");
  }
  if (node.type === "ObjectExpression") {
    return node.properties.map(classText).join(" ");
  }
  if (node.type === "Property") {
    return `${classText(node.key)} ${classText(node.value)}`;
  }
  return "";
};

const isClassHelperCall = (node: ClassNode): node is ESTree.CallExpression =>
  node?.type === "CallExpression" &&
  node.callee.type === "Identifier" &&
  CLASS_FUNCTIONS.has(node.callee.name);

const attributeName = (attribute: ESTree.JSXAttributeItem): string | null =>
  attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier"
    ? attribute.name.name
    : null;

export const noTransitionColorsRule = defineRule({
  create(context) {
    const check = (node: ESTree.Node, value: ClassNode) => {
      if (TRANSITION_COLORS_CLASS.test(classText(value))) {
        context.report({ messageId: "transitionColors", node });
      }
    };
    return {
      CallExpression(node) {
        if (isClassHelperCall(node)) {
          check(node, node);
        }
      },
      JSXAttribute(node) {
        const name = attributeName(node);
        if (name === null || !CLASS_ATTRIBUTES.has(name)) {
          return;
        }
        // `cn(...)` values are reported once, by the CallExpression visitor.
        const expression =
          node.value?.type === "JSXExpressionContainer"
            ? node.value.expression
            : null;
        if (!isClassHelperCall(expression)) {
          check(node, node.value);
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow `transition-colors`: hover, active, and selected color changes snap instantly.",
    },
    messages: {
      transitionColors:
        "Remove `transition-colors`. Color changes on hover and selection should be instant; if motion helps, animate `transform` or `opacity`.",
    },
    schema: [],
    type: "problem",
  },
});

const isHiddenInput = (node: ESTree.JSXOpeningElement) =>
  node.attributes.some(
    (attribute) =>
      attributeName(attribute) === "type" &&
      attribute.type === "JSXAttribute" &&
      attribute.value?.type === "Literal" &&
      attribute.value.value === "hidden"
  );

export const preferSharedControlsRule = defineRule({
  create(context) {
    if (context.filename.replaceAll("\\", "/").includes(SHARED_UI_DIRECTORY)) {
      return {};
    }
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") {
          return;
        }
        const tag = node.name.name;
        const replacement = SHARED_CONTROL_REPLACEMENTS.get(tag);
        // A hidden input carries form state, not UI.
        if (
          replacement === undefined ||
          (tag === "input" && isHiddenInput(node))
        ) {
          return;
        }
        context.report({
          data: { replacement, tag },
          messageId: "raw",
          node,
        });
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow native buttons, inputs, selects, and textareas outside components/ui. Shared primitives own how controls look, focus, and announce state.",
    },
    messages: {
      raw: "Use {{replacement}} from components/ui instead of a native `<{{tag}}>`. Add a variant to the primitive if none fits.",
    },
    schema: [],
    type: "problem",
  },
});

export const noLongDashesRule = defineRule({
  create(context) {
    const check = (node: ESTree.Node, text: string) => {
      if (LONG_DASH.test(text)) {
        context.report({ messageId: "dash", node });
      }
    };
    return {
      JSXText(node) {
        check(node, node.value);
      },
      Literal(node) {
        // Regex literals are patterns, not copy (LONG_DASH above, for one).
        if (!("regex" in node)) {
          check(node, String(node.value));
        }
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? "");
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow em and en dashes in strings and JSX text. They read as machine-written in UI copy.",
    },
    messages: {
      dash: "Replace the em/en dash with a hyphen, comma, colon, or parentheses.",
    },
    schema: [],
    type: "suggestion",
  },
});

export default definePlugin({
  meta: { name: "local" },
  rules: {
    "no-long-dashes": noLongDashesRule,
    "no-transition-colors": noTransitionColorsRule,
    "prefer-shared-controls": preferSharedControlsRule,
  },
});
