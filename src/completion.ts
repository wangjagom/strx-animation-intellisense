import { analyze, KEYFRAME_PREFIXES, type GrammarContext } from "./grammar";

export type CompletionCategory =
  | "preset"
  | "keyframePrefix"
  | "utility"
  | "layout"
  | "transition"
  | "easing"
  | "timing"
  | "legacy";

export interface CompletionData {
  label: string;
  /** Plain text, or a snippet when `snippet` is true. */
  insertText: string;
  snippet: boolean;
  category: CompletionCategory;
  detail: string;
  documentation: string;
  /** Re-open suggestions after inserting, e.g. after `from:`. */
  retrigger?: boolean;
  deprecated?: boolean;
}

export interface CompletionResult {
  /** Offsets within the value of the text the completion replaces. */
  replaceStart: number;
  replaceEnd: number;
  items: CompletionData[];
}

const COMMON_DURATIONS = [150, 200, 300, 500, 700, 1000];
const COMMON_DELAYS = [100, 200, 300];

/**
 * Computes completions for the token at `offset` inside an animate string.
 *
 * Suggestions follow the library's grammar: one preset, layout token,
 * transition token, and easing per comma group.
 */
export function computeCompletions(
  value: string,
  offset: number,
  context: GrammarContext,
): CompletionResult {
  const before = value.slice(0, offset);
  const tokenStart = Math.max(
    before.lastIndexOf(" "),
    before.lastIndexOf("\t"),
    before.lastIndexOf("\n"),
    before.lastIndexOf(","),
  ) + 1;
  const after = value.slice(offset);
  const tokenEnd = offset + (/^[^\s,]*/.exec(after)?.[0].length ?? 0);
  const current = value.slice(tokenStart, offset);
  const group = before.split(",").length - 1;
  const others = analyze(value, context).filter(
    (token) => token.group === group && token.start !== tokenStart,
  );
  const result: CompletionResult = {
    replaceStart: tokenStart,
    replaceEnd: tokenEnd,
    items: [],
  };
  const { metadata } = context;
  const prefix = KEYFRAME_PREFIXES.find((candidate) =>
    current.startsWith(candidate),
  );

  if (prefix) {
    result.items = utilityCompletions(prefix, context);
    return result;
  }

  const has = (kind: string) => others.some((token) => token.kind === kind);
  const hasPresetSlot = !others.some((token) => token.presetSlot);
  const items: CompletionData[] = [];

  if (hasPresetSlot) {
    for (const preset of metadata.presets) {
      items.push({
        label: preset.name,
        insertText: preset.name,
        snippet: false,
        category: "preset",
        detail: `STRX preset · ${preset.motion}`,
        documentation: describeFrames(preset.initial, preset.target),
      });
    }

    for (const name of context.customPresets) {
      if (!metadata.presets.some((preset) => preset.name === name)) {
        items.push({
          label: name,
          insertText: name,
          snippet: false,
          category: "preset",
          detail: "STRX custom preset",
          documentation: "Registered with `definePreset` in this workspace.",
        });
      }
    }
  }

  for (const keyframe of metadata.keyframePrefixes) {
    items.push({
      label: keyframe.prefix,
      insertText: keyframe.prefix,
      snippet: false,
      category: "keyframePrefix",
      detail: "STRX keyframe prefix",
      documentation: keyframe.description,
      retrigger: true,
    });
  }

  if (!has("layout")) {
    for (const layout of metadata.layout) {
      items.push({
        label: layout.token,
        insertText: layout.token,
        snippet: false,
        category: "layout",
        detail: `STRX layout transition · ${layout.motion}`,
        documentation: layout.description,
      });
    }
  }

  if (!has("transition")) {
    for (const transition of metadata.transitions) {
      items.push({
        label: transition.token,
        insertText: transition.token,
        snippet: false,
        category: "transition",
        detail: "STRX style transition",
        documentation: transition.description,
      });
    }
  }

  const groupTexts = new Set(others.map((token) => token.text));
  const hasEasing = others.some(
    (token) =>
      token.text === metadata.spring.token ||
      metadata.easings.some((easing) => easing.token === token.text),
  );

  if (!hasEasing) {
    for (const easing of metadata.easings) {
      items.push({
        label: easing.token,
        insertText: easing.token,
        snippet: false,
        category: "easing",
        detail: "STRX easing",
        documentation: easing.description,
      });
    }

    items.push({
      label: metadata.spring.token,
      insertText: metadata.spring.token,
      snippet: false,
      category: "easing",
      detail: "STRX spring driver",
      documentation: metadata.spring.description,
    });
  }

  const hasPrefix = (prefix: string) =>
    [...groupTexts].some((text) => text.startsWith(prefix));

  for (const timing of metadata.numericTiming) {
    if (hasPrefix(timing.prefix)) {
      continue;
    }

    const defaultValue = timing.example.slice(timing.prefix.length);
    const common =
      timing.prefix === "duration-"
        ? COMMON_DURATIONS
        : timing.prefix === "delay-"
          ? COMMON_DELAYS
          : [];

    items.push({
      label: `${timing.prefix}{number}`,
      insertText: `${timing.prefix}\${1:${defaultValue}}`,
      snippet: true,
      category: "timing",
      detail: "STRX timing",
      documentation: timing.description,
    });

    for (const value of common) {
      items.push({
        label: `${timing.prefix}${value}`,
        insertText: `${timing.prefix}${value}`,
        snippet: false,
        category: "timing",
        detail: "STRX timing",
        documentation: timing.description,
      });
    }
  }

  const hasCount = metadata.countTiming.some((count) => hasPrefix(count.prefix));

  if (!hasCount) {
    for (const count of metadata.countTiming) {
      const category = count.legacy ? "legacy" : "timing";

      items.push(
        {
          label: `${count.prefix}{number}`,
          insertText: `${count.prefix}\${1:${count.example.slice(count.prefix.length)}}`,
          snippet: true,
          category,
          detail: count.legacy ? "STRX timing (legacy)" : "STRX timing",
          documentation: count.description,
          deprecated: count.legacy,
        },
        {
          label: `${count.prefix}infinite`,
          insertText: `${count.prefix}infinite`,
          snippet: false,
          category,
          detail: count.legacy ? "STRX timing (legacy)" : "STRX timing",
          documentation: count.description,
          deprecated: count.legacy,
        },
      );
    }
  }

  result.items = items;
  return result;
}

function utilityCompletions(
  prefix: string,
  { metadata }: GrammarContext,
): CompletionData[] {
  const items: CompletionData[] = [];
  const description =
    metadata.keyframePrefixes.find((keyframe) => keyframe.prefix === prefix)
      ?.description ?? "";

  for (const utility of metadata.utilities) {
    const sample = utility.example.slice(utility.prefix.length);
    const documentation = `${description}\n\n\`${utility.example}\` → \`${utility.result}\`${
      utility.max !== undefined ? ` (0–${utility.max})` : ""
    }`;

    items.push({
      label: `${prefix}${utility.prefix}{number}`,
      insertText: `${prefix}${utility.prefix}\${1:${sample}}`,
      snippet: true,
      category: "utility",
      detail: `STRX ${utility.property}`,
      documentation,
    });

    if (utility.signed) {
      items.push({
        label: `${prefix}-${utility.prefix}{number}`,
        insertText: `${prefix}-${utility.prefix}\${1:${sample}}`,
        snippet: true,
        category: "utility",
        detail: `STRX negative ${utility.property}`,
        documentation,
      });
    }
  }

  return items;
}

export function describeFrames(
  initial: Record<string, number>,
  target: Record<string, number>,
): string {
  const format = (frame: Record<string, number>) =>
    Object.entries(frame)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");

  return `\`${format(initial)}\` → \`${format(target)}\``;
}
