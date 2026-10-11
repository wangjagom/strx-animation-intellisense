import type { TokenMetadata } from "./metadata";

/**
 * Mirrors the token rules of react-native-strx's parser so editor
 * diagnostics match the warnings the library logs at runtime.
 */
export type TokenKind =
  | "preset"
  | "keyframe"
  | "layout"
  | "transition"
  | "timing"
  | "invalid";

export interface TokenIssue {
  message: string;
  /** Replacement for the whole token, offered as a quick fix. */
  suggestion?: string;
  /** Insert ", " before the token to start a new group. */
  needsComma?: boolean;
}

export interface TokenInfo {
  text: string;
  /** Offsets within the analyzed value. */
  start: number;
  end: number;
  group: number;
  kind: TokenKind;
  issue?: TokenIssue;
  /** Bare words take the group's single preset slot, valid or not. */
  presetSlot?: boolean;
}

export interface GrammarContext {
  metadata: TokenMetadata;
  /** Presets registered with `definePreset` in the workspace. */
  customPresets: ReadonlySet<string>;
}

export const KEYFRAME_PREFIXES = ["from:", "to:", "exit:"] as const;

/** Splits a token string into tokens with their group index and offsets. */
export function tokenize(
  value: string,
): { text: string; start: number; end: number; group: number }[] {
  const tokens: { text: string; start: number; end: number; group: number }[] =
    [];
  const pattern = /[^\s,]+|,/g;
  let group = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match[0] === ",") {
      group += 1;
      continue;
    }

    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      group,
    });
  }

  return tokens;
}

export function parseUnsignedNumber(input: string): number | undefined {
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(input) || input.length > 12) {
    return undefined;
  }

  const value = Number(input);

  return Number.isFinite(value) ? value : undefined;
}

function parseCount(input: string): boolean {
  if (input === "infinite") {
    return true;
  }

  const value = parseUnsignedNumber(input);

  return value !== undefined && Number.isInteger(value) && value > 0;
}

export function isValidUtility(utility: string, metadata: TokenMetadata): boolean {
  const negative = utility.startsWith("-");
  const body = negative ? utility.slice(1) : utility;
  const definition = metadata.utilities.find((candidate) =>
    body.startsWith(candidate.prefix),
  );

  if (!definition || (negative && !definition.signed)) {
    return false;
  }

  return parseUnsignedNumber(body.slice(definition.prefix.length)) !== undefined;
}

export function presetNames(context: GrammarContext): Set<string> {
  return new Set([
    ...context.metadata.presets.map((preset) => preset.name),
    ...context.customPresets,
  ]);
}

/** Classifies timing tokens: "valid", "invalid" (known prefix, bad value), or "none". */
function classifyTiming(
  token: string,
  metadata: TokenMetadata,
): "valid" | "invalid" | "none" {
  if (
    token === metadata.spring.token ||
    metadata.easings.some((easing) => easing.token === token)
  ) {
    return "valid";
  }

  for (const { prefix } of metadata.numericTiming) {
    if (token.startsWith(prefix)) {
      return parseUnsignedNumber(token.slice(prefix.length)) === undefined
        ? "invalid"
        : "valid";
    }
  }

  for (const { prefix } of metadata.countTiming) {
    if (token.startsWith(prefix)) {
      return parseCount(token.slice(prefix.length)) ? "valid" : "invalid";
    }
  }

  return "none";
}

export function analyze(value: string, context: GrammarContext): TokenInfo[] {
  const { metadata } = context;
  const presets = presetNames(context);
  const groupsWithPreset = new Set<number>();

  return tokenize(value).map((token) => {
    const info: TokenInfo = { ...token, kind: "invalid" };
    const text = token.text;
    const prefix = KEYFRAME_PREFIXES.find((candidate) =>
      text.startsWith(candidate),
    );

    if (prefix) {
      if (isValidUtility(text.slice(prefix.length), metadata)) {
        info.kind = "keyframe";
      } else {
        info.issue = {
          message: `Unknown keyframe utility "${text}".`,
          suggestion: suggest(text, keyframeCandidates(text, prefix, metadata)),
        };
      }

      return info;
    }

    if (metadata.layout.some((layout) => layout.token === text)) {
      info.kind = "layout";
      return info;
    }

    if (metadata.transitions.some((transition) => transition.token === text)) {
      info.kind = "transition";
      return info;
    }

    const timing = classifyTiming(text, metadata);

    if (timing === "valid") {
      info.kind = "timing";
      return info;
    }

    if (timing === "invalid") {
      info.issue = {
        message: `Invalid value in "${text}". Use an unsigned number such as 300 or 0.5.`,
      };
      return info;
    }

    if (groupsWithPreset.has(token.group)) {
      info.issue = {
        message: `Only one preset is allowed per group; "${text}" is ignored. Separate presets with commas.`,
        needsComma: true,
      };
      return info;
    }

    groupsWithPreset.add(token.group);
    info.presetSlot = true;

    if (presets.has(text)) {
      info.kind = "preset";
      return info;
    }

    info.issue = {
      message: `Unknown animate token "${text}".`,
      suggestion: suggest(text, baseCandidates(context)),
    };

    return info;
  });
}

/** Validates a preset name used as `{ type: "..." }` in an animate object. */
export function analyzePresetName(
  name: string,
  context: GrammarContext,
): TokenIssue | undefined {
  if (presetNames(context).has(name)) {
    return undefined;
  }

  return {
    message: `Unknown preset "${name}".`,
    suggestion: suggest(name, [...presetNames(context)]),
  };
}

function baseCandidates(context: GrammarContext): string[] {
  const { metadata } = context;

  return [
    ...presetNames(context),
    ...metadata.layout.map((layout) => layout.token),
    ...metadata.transitions.map((transition) => transition.token),
    ...metadata.easings.map((easing) => easing.token),
    metadata.spring.token,
  ];
}

function keyframeCandidates(
  token: string,
  prefix: string,
  metadata: TokenMetadata,
): string[] {
  const rest = token.slice(prefix.length);
  const sign = rest.startsWith("-") ? "-" : "";
  const value = /(\d+(?:\.\d+)?)$/.exec(rest)?.[1] ?? "0";

  return metadata.utilities.map(
    (utility) => `${prefix}${sign}${utility.prefix}${value}`,
  );
}

export function suggest(
  token: string,
  candidates: Iterable<string>,
): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;

  for (const candidate of candidates) {
    const distance = levenshtein(token, candidate);

    if (distance > 0 && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(
        above + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }

  return row[b.length];
}
