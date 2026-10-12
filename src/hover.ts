import { describeFrames } from "./completion";
import {
  previewMarkdown,
  tokenPreviewMarkdown,
  valuePreviewSvg,
} from "./preview";
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
  options: { previews?: boolean } = {},
): HoverData | undefined {
  const tokens = analyze(value, context);
  const token = tokens.find(
    (candidate) => offset >= candidate.start && offset <= candidate.end,
  );

  if (!token) {
    return undefined;
  }

  const description = describeToken(token.text, context);
  let markdown = description ?? token.issue?.message;

  if (!markdown) {
    return undefined;
  }

  if (options.previews && description) {
    markdown += previewSection(token, value, tokens, context);
  }

  return { start: token.start, end: token.end, markdown };
}

/**
 * Animated previews for a hovered token: the token on its own, then the
 * whole animate value when it combines several valid tokens.
 */
function previewSection(
  hovered: ReturnType<typeof analyze>[number],
  value: string,
  tokens: ReturnType<typeof analyze>,
  { metadata }: GrammarContext,
): string {
  const groupTokens = tokens
    .filter(
      (candidate) =>
        candidate.group === hovered.group &&
        candidate !== hovered &&
        !candidate.issue,
    )
    .map((candidate) => candidate.text);
  const token = tokenPreviewMarkdown(hovered.text, metadata, groupTokens);
  let section = token ? `\n\n${token}` : "";

  if (tokens.length > 1 && tokens.every((candidate) => !candidate.issue)) {
    const whole = previewMarkdown(valuePreviewSvg(value, metadata));

    if (whole) {
      section += `\n\n---\n\nWhole value \`${value.trim().replace(/`/g, "")}\`\n\n${whole}`;
    }
  }

  return section.replace(/\n\n$/, "");
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
