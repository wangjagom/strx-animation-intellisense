import { describeFrames } from "./completion";
import {
  analyze,
  KEYFRAME_PREFIXES,
  presetNames,
  type GrammarContext,
} from "./grammar";

export interface HoverData {
  /** Offsets within the value. */
  start: number;
  end: number;
  markdown: string;
}

/** Describes the token at `offset` inside an animate string. */
export function computeHover(
  value: string,
  offset: number,
  context: GrammarContext,
): HoverData | undefined {
  const token = analyze(value, context).find(
    (candidate) => offset >= candidate.start && offset <= candidate.end,
  );

  if (!token) {
    return undefined;
  }

  const markdown = describeToken(token.text, context) ?? token.issue?.message;

  return markdown
    ? { start: token.start, end: token.end, markdown }
    : undefined;
}

export function describeToken(
  text: string,
  context: GrammarContext,
): string | undefined {
  const { metadata } = context;
  const title = `**\`${text}\`**`;
  const preset = metadata.presets.find((candidate) => candidate.name === text);

  if (preset) {
    return `${title} — preset (${preset.motion})\n\n${describeFrames(
      preset.initial,
      preset.target,
    )}`;
  }

  if (context.customPresets.has(text) && presetNames(context).has(text)) {
    return `${title} — custom preset registered with \`definePreset\`.`;
  }

  const prefix = KEYFRAME_PREFIXES.find((candidate) =>
    text.startsWith(candidate),
  );

  if (prefix) {
    const utilityText = text.slice(prefix.length).replace(/^-/, "");
    const utility = metadata.utilities.find((candidate) =>
      utilityText.startsWith(candidate.prefix),
    );
    const keyframe = metadata.keyframePrefixes.find(
      (candidate) => candidate.prefix === prefix,
    );

    if (utility && keyframe) {
      return `${title} — ${keyframe.description}\n\nSets \`${utility.property}\`. Example: \`${utility.example}\` → \`${utility.result}\`.`;
    }

    return undefined;
  }

  const layout = metadata.layout.find((candidate) => candidate.token === text);

  if (layout) {
    return `${title} — ${layout.description} (${layout.motion})`;
  }

  const transition = metadata.transitions.find(
    (candidate) => candidate.token === text,
  );

  if (transition) {
    return `${title} — animates style changes: ${transition.description}`;
  }

  const easing = metadata.easings.find((candidate) => candidate.token === text);

  if (easing) {
    return `${title} — ${easing.description}`;
  }

  if (text === metadata.spring.token) {
    return `${title} — ${metadata.spring.description}`;
  }

  const timing = [...metadata.numericTiming, ...metadata.countTiming].find(
    (candidate) => text.startsWith(candidate.prefix),
  );

  return timing ? `${title} — ${timing.description}` : undefined;
}
