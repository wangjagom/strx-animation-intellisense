import { parse, type ParserPlugin } from "@babel/parser";
import type * as t from "@babel/types";

/**
 * A static string inside an `animate` value.
 *
 * `start`/`end` are document offsets of the string contents (without
 * quotes). Template literals with `${}` produce one segment per static part;
 * `openStart`/`openEnd` mark edges that touch an expression, where a token
 * may continue outside the segment.
 */
export interface AnimateSegment {
  start: number;
  end: number;
  value: string;
  /** `tokens`: an animate token string. `presetName`: `{ type: "..." }`. */
  kind: "tokens" | "presetName";
  openStart: boolean;
  openEnd: boolean;
}

export type SourceLanguage =
  | "typescript"
  | "typescriptreact"
  | "javascript"
  | "javascriptreact";

function pluginsFor(language: SourceLanguage): ParserPlugin[] {
  switch (language) {
    case "typescript":
      return ["typescript"];
    case "typescriptreact":
      return ["jsx", "typescript"];
    default:
      return ["jsx"];
  }
}

/**
 * Finds every animate string in a source file: JSX `animate` attributes and
 * `animate` object properties (for example `Strx.useTimeline` playables),
 * including strings nested in arrays, ternaries, and logical expressions.
 *
 * Returns `undefined` when the file cannot be parsed.
 */
export function findAnimateSegments(
  text: string,
  language: SourceLanguage,
): AnimateSegment[] | undefined {
  let file: t.File;

  try {
    file = parse(text, {
      sourceType: "unambiguous",
      plugins: pluginsFor(language),
      errorRecovery: true,
    });
  } catch {
    return undefined;
  }

  const segments: AnimateSegment[] = [];

  walk(file.program, (node) => {
    if (
      node.type === "JSXAttribute" &&
      node.name.type === "JSXIdentifier" &&
      node.name.name === "animate" &&
      node.value
    ) {
      collect(node.value, segments);
      return false;
    }

    if (
      node.type === "ObjectProperty" &&
      !node.computed &&
      propertyName(node.key) === "animate"
    ) {
      collect(node.value, segments);
      return false;
    }

    return true;
  });

  return segments;
}

/** Finds the segment whose contents contain `offset` (edges inclusive). */
export function segmentAt(
  segments: readonly AnimateSegment[],
  offset: number,
): AnimateSegment | undefined {
  return segments.find(
    (segment) => offset >= segment.start && offset <= segment.end,
  );
}

function propertyName(key: t.Node): string | undefined {
  if (key.type === "Identifier") {
    return key.name;
  }

  if (key.type === "StringLiteral") {
    return key.value;
  }

  return undefined;
}

/** Collects static strings from an animate value expression. */
function collect(node: t.Node, segments: AnimateSegment[]): void {
  switch (node.type) {
    case "StringLiteral":
      if (node.start !== null && node.start !== undefined && node.end) {
        segments.push({
          start: node.start + 1,
          end: node.end - 1,
          value: node.value,
          kind: "tokens",
          openStart: false,
          openEnd: false,
        });
      }
      return;
    case "TemplateLiteral":
      node.quasis.forEach((quasi, index) => {
        if (quasi.start === null || quasi.start === undefined || !quasi.end) {
          return;
        }

        segments.push({
          start: quasi.start,
          end: quasi.end,
          value: quasi.value.cooked ?? quasi.value.raw,
          kind: "tokens",
          openStart: index > 0,
          openEnd: index < node.quasis.length - 1,
        });
      });
      return;
    case "JSXExpressionContainer":
      collect(node.expression, segments);
      return;
    case "ArrayExpression":
      for (const element of node.elements) {
        if (element) {
          collect(element, segments);
        }
      }
      return;
    case "ConditionalExpression":
      collect(node.consequent, segments);
      collect(node.alternate, segments);
      return;
    case "LogicalExpression":
      collect(node.left, segments);
      collect(node.right, segments);
      return;
    case "ParenthesizedExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
      collect(node.expression, segments);
      return;
    case "ObjectExpression":
      for (const property of node.properties) {
        if (
          property.type === "ObjectProperty" &&
          !property.computed &&
          propertyName(property.key) === "type" &&
          property.value.type === "StringLiteral" &&
          property.value.start !== null &&
          property.value.start !== undefined &&
          property.value.end
        ) {
          segments.push({
            start: property.value.start + 1,
            end: property.value.end - 1,
            value: property.value.value,
            kind: "presetName",
            openStart: false,
            openEnd: false,
          });
        }
      }
      return;
    default:
      return;
  }
}

/** Depth-first walk; `visit` returns false to skip a node's children. */
function walk(node: t.Node, visit: (node: t.Node) => boolean): void {
  if (!visit(node)) {
    return;
  }

  for (const key of Object.keys(node) as (keyof t.Node)[]) {
    if (
      key === "leadingComments" ||
      key === "trailingComments" ||
      key === "innerComments" ||
      key === "loc"
    ) {
      continue;
    }

    const child = node[key] as unknown;

    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNode(item)) {
          walk(item, visit);
        }
      }
    } else if (isNode(child)) {
      walk(child, visit);
    }
  }
}

function isNode(value: unknown): value is t.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
