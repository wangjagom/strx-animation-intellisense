import type { TokenMetadata } from "./metadata";

/**
 * Animated SVG previews for completion and hover docs.
 *
 * VS Code renders `data:` images in Markdown docs, and CSS animations inside
 * an SVG image keep playing there, so a preview needs no webview or script.
 * Values come from the same token metadata the library publishes, so a
 * preview runs with the preset's real duration, easing, or spring.
 */

type Channel =
  | "opacity"
  | "translateX"
  | "translateY"
  | "scale"
  | "scaleX"
  | "scaleY"
  | "rotate"
  | "width"
  | "height";

interface Timing {
  driver: "timing" | "spring";
  duration: number;
  delay: number;
  easing: string;
  damping: number;
  stiffness: number;
  mass: number;
  /** Total plays; `Infinity` loops. */
  play: number;
}

interface Group {
  from: Partial<Record<Channel, number>>;
  to: Partial<Record<Channel, number>>;
  exit: Partial<Record<Channel, number>>;
  layout?: string;
  transition?: string;
  timing: Timing;
  /** Whether the group set its own duration or easing (exits use them). */
  explicitDuration: boolean;
  explicitEasing: boolean;
}

interface Track {
  from: number;
  to: number;
  timing: Timing;
}

const WIDTH = 240;
const HEIGHT = 120;
const CARD_W = 72;
const CARD_H = 44;
const CARD_X = (WIDTH - CARD_W) / 2;
const CARD_Y = 30;
/** Largest translate the stage shows per axis; bigger moves are scaled down. */
const MAX_SHIFT_X = 70;
const MAX_SHIFT_Y = 40;
const HOLD_MS = 900;
const LEAD_MS = 500;

const NEUTRAL: Record<Channel, number | undefined> = {
  opacity: 1,
  translateX: 0,
  translateY: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  width: undefined,
  height: undefined,
};

const EXIT_CHANNELS: Channel[] = ["opacity", "translateX", "translateY", "scale"];

/** Library easing curves (react-native-strx `src/core/easing.ts`). */
const EASINGS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  ease: (t) => t * t * (3 - 2 * t),
  "ease-in": (t) => t * t * t,
  "ease-out": (t) => 1 - Math.pow(1 - t, 3),
  "ease-in-out": (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

const NUMBER = /^\d+(\.\d+)?$/;

// ------------------------------------------------------------------ parsing

function parseUtility(
  body: string,
  metadata: TokenMetadata,
): { property: Channel; value: number } | undefined {
  const negative = body.startsWith("-");
  const rest = negative ? body.slice(1) : body;
  const utility = [...metadata.utilities]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((candidate) => rest.startsWith(candidate.prefix));

  if (!utility) {
    return undefined;
  }

  const raw = rest.slice(utility.prefix.length);

  if (!NUMBER.test(raw) || (negative && !utility.signed)) {
    return undefined;
  }

  let value = Number(raw);

  if (utility.property === "opacity") {
    value = Math.min(value, utility.max ?? 100) / 100;
  } else if (utility.property.startsWith("scale")) {
    value /= 100;
  }

  return {
    property: utility.property as Channel,
    value: negative ? -value : value,
  };
}

function parseMotion(motion: string): Partial<Timing> {
  const result: Partial<Timing> = {
    driver: /^spring|damping/.test(motion) ? "spring" : "timing",
  };
  const duration = /(\d+)ms/.exec(motion);

  if (duration) {
    result.duration = Number(duration[1]);
  }

  for (const key of ["damping", "stiffness", "mass"] as const) {
    const match = new RegExp(`${key} ([\\d.]+)`).exec(motion);

    if (match) {
      result[key] = Number(match[1]);
    }
  }

  return result;
}

/** Resolves an animate string into groups, like the library's parser. */
function resolve(value: string, metadata: TokenMetadata): Group[] {
  const easings = new Set(metadata.easings.map((easing) => easing.token));
  const layouts = new Set(metadata.layout.map((layout) => layout.token));
  const transitions = new Set(metadata.transitions.map((item) => item.token));

  return value
    .split(",")
    .map((group) => group.trim().split(/\s+/).filter(Boolean))
    .filter((tokens) => tokens.length > 0)
    .map((tokens) => {
      const from: Group["from"] = {};
      const to: Group["to"] = {};
      const exit: Group["exit"] = {};
      const explicit: Partial<Timing> = {};
      let presetMotion: Partial<Timing> = {};
      let presetFrom: Group["from"] = {};
      let presetTo: Group["to"] = {};
      let layout: string | undefined;
      let transition: string | undefined;

      for (const token of tokens) {
        const preset = metadata.presets.find((item) => item.name === token);

        if (preset) {
          presetFrom = preset.initial as Group["from"];
          presetTo = preset.target as Group["to"];
          presetMotion = parseMotion(preset.motion);
          continue;
        }

        if (layouts.has(token)) {
          layout = token;
          continue;
        }

        if (transitions.has(token)) {
          transition = token;
          continue;
        }

        if (easings.has(token) || token === metadata.spring.token) {
          explicit.easing = token;
          continue;
        }

        const colon = token.indexOf(":");

        if (colon > 0) {
          const frame = { from, to, exit }[token.slice(0, colon)];
          const utility = parseUtility(token.slice(colon + 1), metadata);

          if (frame && utility) {
            frame[utility.property] = utility.value;
          }

          continue;
        }

        const match = /^([a-z]+)-(.+)$/.exec(token);

        if (!match) {
          continue;
        }

        if (match[1] === "play" || match[1] === "repeat") {
          explicit.play =
            match[2] === "infinite" ? Infinity : Number(match[2]) || 1;
        } else if (
          ["duration", "delay", "damping", "stiffness", "mass"].includes(
            match[1],
          ) &&
          NUMBER.test(match[2])
        ) {
          explicit[match[1] as "duration"] = Number(match[2]);
        }
      }

      const fromFrame = { ...presetFrom, ...from };
      const toFrame = { ...presetTo, ...to };

      for (const key of Object.keys(fromFrame) as Channel[]) {
        if (!(key in toFrame)) {
          toFrame[key] = NEUTRAL[key];
        }
      }

      for (const key of Object.keys(toFrame) as Channel[]) {
        if (!(key in fromFrame)) {
          fromFrame[key] = NEUTRAL[key];
        }
      }

      const spring =
        explicit.easing === metadata.spring.token ||
        presetMotion.driver === "spring";

      return {
        from: fromFrame,
        to: toFrame,
        exit,
        layout,
        transition,
        explicitDuration: explicit.duration !== undefined,
        explicitEasing:
          explicit.easing !== undefined &&
          explicit.easing !== metadata.spring.token,
        timing: {
          driver: spring ? "spring" : "timing",
          duration: explicit.duration ?? presetMotion.duration ?? 300,
          delay: explicit.delay ?? 0,
          easing:
            explicit.easing && explicit.easing !== metadata.spring.token
              ? explicit.easing
              : "ease-out",
          damping: explicit.damping ?? presetMotion.damping ?? 10,
          stiffness: explicit.stiffness ?? presetMotion.stiffness ?? 100,
          mass: explicit.mass ?? presetMotion.mass ?? 1,
          play: explicit.play ?? 1,
        },
      };
    });
}

// ------------------------------------------------------------------- curves

interface Curve {
  duration: number;
  at(ms: number): number;
}

const springCache = new Map<string, Curve>();

/** Simulates a damped spring from 0 to 1 in 1ms steps. */
function springCurve(damping: number, stiffness: number, mass: number): Curve {
  const key = `${damping}/${stiffness}/${mass}`;
  const cached = springCache.get(key);

  if (cached) {
    return cached;
  }

  const samples = [0];
  let x = 0;
  let v = 0;

  for (let t = 1; t <= 4000; t += 1) {
    const force = -stiffness * (x - 1) - damping * v;
    v += (force / Math.max(mass, 0.01)) * 0.001;
    x += v * 0.001;
    samples.push(x);

    if (t > 50 && Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.02) {
      break;
    }
  }

  samples[samples.length - 1] = 1;

  const curve: Curve = {
    duration: samples.length - 1,
    at: (ms) =>
      samples[Math.max(0, Math.min(samples.length - 1, Math.round(ms)))],
  };
  springCache.set(key, curve);

  return curve;
}

function curveFor(timing: Timing): Curve {
  if (timing.driver === "spring") {
    return springCurve(timing.damping, timing.stiffness, timing.mass);
  }

  const ease = EASINGS[timing.easing] ?? EASINGS.ease;
  const duration = Math.max(1, timing.duration);

  return {
    duration,
    at: (ms) => ease(Math.max(0, Math.min(1, ms / duration))),
  };
}

// --------------------------------------------------------------- rendering

type Frame = Partial<Record<Channel | "fill", number | string>>;

interface Scene {
  /** Keyframes for the card, as (time ms, values). */
  frames: { time: number; values: Frame }[];
  cycle: number;
  infinite: boolean;
  /** Start and end of the motion, for the progress bar. */
  motion: [number, number];
  label: string;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

function timingLabel(timing: Timing): string {
  const parts =
    timing.driver === "spring"
      ? [`spring d${timing.damping} s${timing.stiffness} m${timing.mass}`]
      : [`${timing.duration}ms ${timing.easing}`];

  if (timing.delay) {
    parts.push(`delay ${timing.delay}ms`);
  }

  if (timing.play !== 1) {
    parts.push(timing.play === Infinity ? "loop" : `×${timing.play}`);
  }

  return parts.join(" · ");
}

/** Samples tracks into keyframes between `start` and `end` (ms). */
function sample(
  tracks: Partial<Record<Channel, Track>>,
  start: number,
  end: number,
): { time: number; values: Frame }[] {
  const keys = Object.keys(tracks) as Channel[];
  const steps = Math.max(2, Math.min(90, Math.ceil((end - start) / 20)));
  const frames: { time: number; values: Frame }[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const local = ((end - start) * i) / steps;
    const values: Frame = {};

    for (const key of keys) {
      const track = tracks[key]!;
      const curve = curveFor(track.timing);
      const plays = track.timing.play === Infinity ? 1 : track.timing.play;
      const elapsed = local - track.timing.delay;
      let progress: number;

      if (elapsed <= 0) {
        progress = 0;
      } else if (elapsed >= curve.duration * plays) {
        progress = 1;
      } else {
        progress = curve.at(elapsed % curve.duration);
      }

      values[key] = track.from + (track.to - track.from) * progress;
    }

    frames.push({ time: start + local, values });
  }

  return frames;
}

function tracksEnd(tracks: Partial<Record<Channel, Track>>): number {
  return Math.max(
    0,
    ...Object.values(tracks).map((track) => {
      const plays = track!.timing.play === Infinity ? 1 : track!.timing.play;
      return track!.timing.delay + curveFor(track!.timing).duration * plays;
    }),
  );
}

function enterScene(groups: Group[]): Scene | undefined {
  const tracks: Partial<Record<Channel, Track>> = {};

  for (const group of groups) {
    for (const key of Object.keys(group.from) as Channel[]) {
      const from = group.from[key];
      const to = group.to[key];

      if (from === undefined || to === undefined) {
        continue;
      }

      tracks[key] = { from, to, timing: group.timing };
    }
  }

  for (const key of Object.keys(tracks) as Channel[]) {
    if (Math.abs(tracks[key]!.from - tracks[key]!.to) < 1e-6) {
      delete tracks[key];
    }
  }

  const keys = Object.keys(tracks) as Channel[];

  if (keys.length === 0) {
    return undefined;
  }

  const first = tracks[keys[0]]!.timing;
  const infinite = keys.some((key) => tracks[key]!.timing.play === Infinity);
  const end = tracksEnd(tracks);
  const frames = sample(tracks, 0, end);

  return {
    frames,
    cycle: infinite ? end : end + HOLD_MS,
    infinite,
    motion: [0, end],
    label: timingLabel(first),
  };
}

function exitScene(groups: Group[]): Scene | undefined {
  const tracks: Partial<Record<Channel, Track>> = {};

  for (const group of groups) {
    const keys = (Object.keys(group.exit) as Channel[]).filter((key) =>
      EXIT_CHANNELS.includes(key),
    );

    if (keys.length === 0) {
      continue;
    }

    // Mirrors the library's exit: 300ms `ease` unless the group sets timing.
    const timing: Timing = {
      ...group.timing,
      driver: "timing",
      duration: group.explicitDuration ? group.timing.duration : 300,
      easing: group.explicitEasing ? group.timing.easing : "ease",
      play: 1,
    };

    for (const key of keys) {
      tracks[key] = { from: NEUTRAL[key]!, to: group.exit[key]!, timing };
    }
  }

  const keys = Object.keys(tracks) as Channel[];

  if (keys.length === 0) {
    return undefined;
  }

  const end = LEAD_MS + tracksEnd(tracks);
  const frames = sample(tracks, LEAD_MS, end);
  frames.unshift({ time: 0, values: frames[0].values });

  return {
    frames,
    cycle: end + HOLD_MS,
    infinite: false,
    motion: [LEAD_MS, end],
    label: `exit · ${timingLabel(tracks[keys[0]]!.timing)}`,
  };
}

/** A style change back and forth, for transition-* and layout-* tokens. */
function toggleScene(
  kind: "transition" | "layout",
  token: string,
  group: Group,
  metadata: TokenMetadata,
): Scene {
  let timing: Timing = { ...group.timing, play: 1 };
  const states: [Frame, Frame] = [{}, {}];

  if (kind === "layout") {
    const layout = metadata.layout.find((item) => item.token === token);
    const motion = parseMotion(layout?.motion ?? "");

    timing =
      motion.driver === "spring"
        ? { ...timing, ...motion, driver: "spring" }
        : {
            ...timing,
            driver: "timing",
            easing: group.explicitEasing ? timing.easing : "ease-in-out",
          };
    states[0] = { width: CARD_W };
    states[1] = { width: CARD_W * 1.8 };
  } else {
    const transition = metadata.transitions.find((item) => item.token === token);

    switch (transition?.kind) {
      case "colors":
        states[0] = { fill: 0 };
        states[1] = { fill: 1 };
        break;
      case "opacity":
        states[0] = { opacity: 1 };
        states[1] = { opacity: 0.3 };
        break;
      case "transform":
        states[0] = { scale: 1, translateX: 0 };
        states[1] = { scale: 1.2, translateX: 24 };
        break;
      case "spacing":
      case "layout":
        states[0] = { width: CARD_W };
        states[1] = { width: CARD_W * 1.6 };
        break;
      default:
        states[0] = { fill: 0, scale: 1 };
        states[1] = { fill: 1, scale: 1.15 };
    }
  }

  const tracksBetween = (a: Frame, b: Frame) => {
    const tracks: Partial<Record<Channel | "fill", Track>> = {};

    for (const key of Object.keys(a) as (Channel | "fill")[]) {
      tracks[key] = { from: a[key] as number, to: b[key] as number, timing };
    }

    return tracks as Partial<Record<Channel, Track>>;
  };

  const forward = tracksBetween(states[0], states[1]);
  const back = tracksBetween(states[1], states[0]);
  const length = tracksEnd(forward);
  const firstStart = LEAD_MS;
  const secondStart = firstStart + length + HOLD_MS;
  const end = secondStart + length;
  const frames = [
    { time: 0, values: states[0] },
    ...sample(forward, firstStart, firstStart + length),
    ...sample(back, secondStart, end),
  ];

  return {
    frames,
    cycle: end + LEAD_MS,
    infinite: false,
    motion: [firstStart, firstStart + length],
    label: `${token} · ${timingLabel(timing)}`,
  };
}

const COLORS = { card: "#4f6bff", alt: "#16a34a", mute: "#8b93a7" };

function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, index: number) =>
    parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const value = [0, 1, 2]
    .map((index) =>
      Math.round(channel(a, index) + (channel(b, index) - channel(a, index)) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

  return `#${value}`;
}

function renderScene(scene: Scene): string {
  const largest = (key: "translateX" | "translateY") =>
    Math.max(
      1,
      ...scene.frames.map((frame) => Math.abs(Number(frame.values[key] ?? 0))),
    );
  const scaleX = Math.min(1, MAX_SHIFT_X / largest("translateX"));
  const scaleY = Math.min(1, MAX_SHIFT_Y / largest("translateY"));
  const percent = (time: number) =>
    `${round((Math.min(time, scene.cycle) / scene.cycle) * 100)}%`;

  const cardKeyframes: string[] = [];
  const boxKeyframes: string[] = [];
  let usesBox = false;

  for (const { time, values } of scene.frames) {
    const transform: string[] = [];
    const tx = Number(values.translateX ?? 0) * scaleX;
    const ty = Number(values.translateY ?? 0) * scaleY;

    if (tx || ty) {
      transform.push(`translate(${round(tx)}px,${round(ty)}px)`);
    }

    if (values.rotate) {
      transform.push(`rotate(${round(Number(values.rotate))}deg)`);
    }

    for (const key of ["scale", "scaleX", "scaleY"] as const) {
      if (values[key] !== undefined) {
        transform.push(`${key}(${round(Number(values[key]))})`);
      }
    }

    const card = [`transform:${transform.join(" ") || "none"}`];

    if (values.opacity !== undefined) {
      card.push(`opacity:${round(Number(values.opacity))}`);
    }

    cardKeyframes.push(`${percent(time)}{${card.join(";")}}`);

    const box: string[] = [];

    if (values.width !== undefined) {
      const width = Math.min(WIDTH - 24, Number(values.width));
      box.push(`width:${round(width)}px`, `x:${round((WIDTH - width) / 2)}px`);
    }

    if (values.height !== undefined) {
      const height = Math.min(HEIGHT - 40, Number(values.height));
      box.push(`height:${round(height)}px`);
    }

    if (values.fill !== undefined) {
      box.push(`fill:${mix(COLORS.card, COLORS.alt, Number(values.fill))}`);
    }

    if (box.length > 0) {
      usesBox = true;
      boxKeyframes.push(`${percent(time)}{${box.join(";")}}`);
    }
  }

  const [motionStart, motionEnd] = scene.motion;
  const progress = [
    `0%{transform:scaleX(0)}`,
    `${percent(motionStart)}{transform:scaleX(0)}`,
    `${percent(motionEnd)}{transform:scaleX(1)}`,
    scene.infinite ? "" : `${percent(scene.cycle - 1)}{transform:scaleX(1)}`,
    `100%{transform:scaleX(${scene.infinite ? 1 : 0})}`,
  ].join("");
  const loop = `${round(scene.cycle)}ms linear infinite`;
  const label = scene.label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<style>`,
    `.c{transform-box:fill-box;transform-origin:center;animation:c ${loop}}`,
    usesBox ? `.b{animation:b ${loop}}` : "",
    `.p{transform-box:fill-box;transform-origin:left;animation:p ${loop}}`,
    `@keyframes c{${cardKeyframes.join("")}}`,
    usesBox ? `@keyframes b{${boxKeyframes.join("")}}` : "",
    `@keyframes p{${progress}}`,
    `@media (prefers-reduced-motion:reduce){.c,.b,.p{animation:none}}`,
    `text{font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:${COLORS.mute}}`,
    `</style>`,
    `<defs><clipPath id="s"><rect width="${WIDTH}" height="${HEIGHT}" rx="10"/></clipPath></defs>`,
    `<g clip-path="url(#s)">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.mute}" fill-opacity="0.12"/>`,
    `<rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="9" fill="none" stroke="${COLORS.mute}" stroke-opacity="0.6" stroke-dasharray="4 3"/>`,
    `<g class="c">`,
    `<rect class="b" x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="9" fill="${COLORS.card}"/>`,
    `<rect x="${CARD_X + 10}" y="${CARD_Y + 12}" width="34" height="6" rx="3" fill="#fff" fill-opacity="0.9"/>`,
    `<rect x="${CARD_X + 10}" y="${CARD_Y + 25}" width="22" height="5" rx="2.5" fill="#fff" fill-opacity="0.55"/>`,
    `</g>`,
    `<rect x="12" y="104" width="${WIDTH - 24}" height="3" rx="1.5" fill="${COLORS.mute}" fill-opacity="0.25"/>`,
    `<rect class="p" x="12" y="104" width="${WIDTH - 24}" height="3" rx="1.5" fill="${COLORS.card}"/>`,
    `<text x="12" y="18">${label}</text>`,
    `</g>`,
    `</svg>`,
  ].join("");
}

// ------------------------------------------------------------------ public

/**
 * Renders an animated preview of an animate string, or `undefined` when it
 * has nothing to show (for example only a custom preset, whose frames the
 * extension doesn't know).
 */
export function previewSvg(
  value: string,
  metadata: TokenMetadata,
): string | undefined {
  const groups = resolve(value, metadata);

  if (groups.length === 0) {
    return undefined;
  }

  const enter = enterScene(groups);

  if (enter) {
    return renderScene(enter);
  }

  const exit = exitScene(groups);

  if (exit) {
    return renderScene(exit);
  }

  const transition = groups.find((group) => group.transition);

  if (transition) {
    return renderScene(
      toggleScene("transition", transition.transition!, transition, metadata),
    );
  }

  const layout = groups.find((group) => group.layout);

  if (layout) {
    return renderScene(toggleScene("layout", layout.layout!, layout, metadata));
  }

  return undefined;
}

/**
 * Maps a single token (or a completion label such as `slide-up` or `from:`)
 * to an animate string that demonstrates its shape. Timing tokens have no
 * shape of their own; `timingSvg` draws them instead.
 */
export function sampleFor(
  token: string,
  metadata: TokenMetadata,
): string | undefined {
  const text = token.replace(/\{number\}$/, "");

  if (text === "from:") {
    return "from:opacity-0 from:translate-y-20";
  }

  if (text === "to:") {
    return "to:opacity-30 to:scale-90";
  }

  if (text === "exit:") {
    return "exit:opacity-0 exit:translate-y-20";
  }

  if (/^(from|to|exit):/.test(text)) {
    // A utility completion without its number uses the metadata example.
    if (/-$/.test(text)) {
      const prefix = text.slice(0, text.indexOf(":") + 1);
      const body = text.slice(prefix.length);
      const negative = body.startsWith("-") ? "-" : "";
      const utility = metadata.utilities.find(
        (candidate) => candidate.prefix === body.replace(/^-/, ""),
      );

      return utility ? `${prefix}${negative}${utility.example}` : undefined;
    }

    return text;
  }

  if (
    metadata.presets.some((preset) => preset.name === text) ||
    metadata.layout.some((layout) => layout.token === text) ||
    metadata.transitions.some((transition) => transition.token === text)
  ) {
    return text;
  }

  return undefined;
}

// ---------------------------------------------------------- timing charts
//
// Timing tokens change when and how fast something moves, which is hard to
// see on a moving card. They get static charts instead: easing and spring
// curves, and millisecond timelines, each drawn over the default value.

const CHART_W = 280;
const CHART_H = 150;
const PLOT = { l: 34, r: 14, t: 34, b: 26 };
const LINE = { l: 14, r: 14 };
const DEFAULT_DURATION = 300;
const DEFAULT_SPRING = { damping: 10, stiffness: 100, mass: 1 };
const WAIT = "#f59e0b";
const SETTLED = "#16a34a";

const EASING_TEXT: Record<string, string> = {
  linear: "same speed all the way",
  ease: "gentle start and end",
  "ease-in": "starts slow, ends fast",
  "ease-out": "starts fast, ends slow",
  "ease-in-out": "slow start and slow end",
};

const escapeText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(
  x: number,
  y: number,
  content: string | number,
  options: { cls?: string; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  return `<text x="${round(x)}" y="${round(y)}"${options.cls ? ` class="${options.cls}"` : ""}${
    options.anchor && options.anchor !== "start"
      ? ` text-anchor="${options.anchor}"`
      : ""
  }${options.fill ? ` style="fill:${options.fill}"` : ""}>${escapeText(String(content))}</text>`;
}

/** Title line: the token in bold, then a short summary. */
function title(token: string, summary: string): string {
  return (
    text(12, 18, token, { cls: "k" }) +
    text(12 + token.length * 6.2 + 8, 18, summary)
  );
}

function chart(body: string, defs = ""): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${CHART_H}" viewBox="0 0 ${CHART_W} ${CHART_H}">`,
    `<style>`,
    `text{font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:${COLORS.mute}}`,
    `.k{font-weight:600;fill:${COLORS.card}}.w{fill:${WAIT}}`,
    `@media (prefers-reduced-motion:reduce){.m{display:none}}`,
    `</style>`,
    defs ? `<defs>${defs}</defs>` : "",
    `<rect width="${CHART_W}" height="${CHART_H}" rx="10" fill="${COLORS.mute}" fill-opacity="0.12"/>`,
    body,
    `</svg>`,
  ].join("");
}

/** Path through (x, y) points in data space. */
function curvePath(
  points: [number, number][],
  xMax: number,
  yMin: number,
  yMax: number,
): string {
  const w = CHART_W - PLOT.l - PLOT.r;
  const h = CHART_H - PLOT.t - PLOT.b;

  return points
    .map(([x, y], index) => {
      const px = PLOT.l + (x / xMax) * w;
      const py = PLOT.t + (1 - (y - yMin) / (yMax - yMin)) * h;
      return `${index ? "L" : "M"}${round(px)} ${round(py)}`;
    })
    .join("");
}

function curveAxes(yMin: number, yMax: number, xLabel: string): string {
  const w = CHART_W - PLOT.l - PLOT.r;
  const h = CHART_H - PLOT.t - PLOT.b;
  const yAt = (value: number) =>
    round(PLOT.t + (1 - (value - yMin) / (yMax - yMin)) * h);

  return (
    `<line x1="${PLOT.l}" x2="${PLOT.l + w}" y1="${yAt(0)}" y2="${yAt(0)}" stroke="${COLORS.mute}" stroke-opacity="0.5"/>` +
    `<line x1="${PLOT.l}" x2="${PLOT.l + w}" y1="${yAt(1)}" y2="${yAt(1)}" stroke="${COLORS.mute}" stroke-opacity="0.35" stroke-dasharray="2 3"/>` +
    text(PLOT.l - 6, yAt(1) + 3, "end", { anchor: "end" }) +
    text(PLOT.l - 6, yAt(0) + 3, "start", { anchor: "end" }) +
    text(PLOT.l, CHART_H - 9, 0) +
    text(PLOT.l + w, CHART_H - 9, xLabel, { anchor: "end" })
  );
}

const solid = (path: string) =>
  `<path d="${path}" fill="none" stroke="${COLORS.card}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const dashed = (path: string) =>
  `<path d="${path}" fill="none" stroke="${COLORS.mute}" stroke-width="1.5" stroke-dasharray="4 3"/>`;

/** A dot that travels along the curve, then rests at its end. */
function tracer(path: string, ms: number): string {
  return `<circle class="m" r="3.5" fill="${COLORS.card}"><animateMotion dur="${round(ms)}ms" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.7;1" calcMode="linear" path="${path}"/></circle>`;
}

/**
 * The timing a token works with inside its comma group: the delay before
 * it, the motion length it shapes, and where those values come from. Charts
 * use it so connected tokens show up together (a delay chart shows the
 * group's real duration, a duration chart starts after the group's delay).
 */
export interface GroupTiming {
  delay: number;
  /** Resolved duration: token, preset default, or 300ms. */
  duration: number;
  /** Where `duration` comes from, e.g. `duration-1000` or `slide-up default`. */
  durationSource: string;
  /** The duration the group would have without a `duration-*` token. */
  baseDuration: number;
  baseSource: string;
  easing: string;
  spring: boolean;
  springSettle: number;
  play: number;
  /** Explicit `duration-*` token in the group, if any. */
  durationToken?: string;
}

const DEFAULT_GROUP: GroupTiming = {
  delay: 0,
  duration: DEFAULT_DURATION,
  durationSource: "default",
  baseDuration: DEFAULT_DURATION,
  baseSource: "default",
  easing: "ease-out",
  spring: false,
  springSettle: 0,
  play: 1,
};

/** Resolves the timing of one comma group's tokens. */
export function groupTiming(
  tokens: readonly string[],
  metadata: TokenMetadata,
): GroupTiming {
  const [group] = resolve(tokens.join(" "), metadata);

  if (!group) {
    return DEFAULT_GROUP;
  }

  const durationToken = tokens.find((token) => /^duration-\d/.test(token));
  const preset = metadata.presets.find((item) => tokens.includes(item.name));
  const presetDuration = preset ? parseMotion(preset.motion).duration : undefined;
  const baseDuration = presetDuration ?? DEFAULT_DURATION;
  const baseSource = presetDuration !== undefined ? `${preset!.name} default` : "default";
  const spring = group.timing.driver === "spring";

  return {
    delay: group.timing.delay,
    duration: group.timing.duration,
    durationSource: durationToken ?? baseSource,
    baseDuration,
    baseSource,
    easing: group.timing.easing,
    spring,
    springSettle: spring
      ? springCurve(group.timing.damping, group.timing.stiffness, group.timing.mass).duration
      : 0,
    play: group.timing.play,
    durationToken,
  };
}

/** Length of one play: the spring's settle time, or the duration. */
const playLength = (ctx: GroupTiming) => (ctx.spring ? ctx.springSettle : ctx.duration);

/** Hatched "wait" band across the plot area, from 0 to `delay`. */
function plotWait(delay: number, xMax: number): string {
  if (!delay) {
    return "";
  }

  const w = CHART_W - PLOT.l - PLOT.r;
  const h = CHART_H - PLOT.t - PLOT.b;
  const width = round((delay / xMax) * w);

  return (
    `<rect x="${PLOT.l}" y="${PLOT.t}" width="${width}" height="${h}" fill="url(#h)" opacity="0.35"/>` +
    text(PLOT.l + 3, PLOT.t + h * 0.62, `wait ${delay}ms`, { cls: "w" })
  );
}

function easingChart(token: string, ctx: GroupTiming = DEFAULT_GROUP): string {
  const delay = ctx.delay;
  const duration = ctx.duration;
  const total = delay + duration;
  const timed = delay > 0 || duration !== DEFAULT_DURATION;
  const points = (ease: (t: number) => number) => {
    const list = Array.from(
      { length: 61 },
      (_, i) => [delay + (i / 60) * duration, ease(i / 60)] as [number, number],
    );
    return delay ? ([[0, 0]] as [number, number][]).concat(list) : list;
  };
  const line = curvePath(points(EASINGS[token]), total, -0.05, 1.05);
  const isDefault = token === "ease-out";
  const legendY = CHART_H - PLOT.b - 6;

  return chart(
    title(token, ctx.spring ? "ignored: group uses a spring" : EASING_TEXT[token] ?? "") +
      plotWait(delay, total) +
      curveAxes(-0.05, 1.05, timed ? `${total}ms` : "time →") +
      (timed
        ? text(PLOT.l + 14, CHART_H - 9, `${duration}ms from ${ctx.durationSource}`)
        : "") +
      (isDefault
        ? text(CHART_W - PLOT.r - 2, legendY, "this is the default", { anchor: "end" })
        : dashed(curvePath(points(EASINGS["ease-out"]), total, -0.05, 1.05)) +
          text(CHART_W - PLOT.r - 2, legendY, "- - ease-out (default)", {
            anchor: "end",
          })) +
      solid(line) +
      tracer(line, Math.max(1800, total * 1.6)),
    delay ? HATCH : "",
  );
}

function springStats(spring: typeof DEFAULT_SPRING) {
  const curve = springCurve(spring.damping, spring.stiffness, spring.mass);
  const points: [number, number][] = [];
  let peak = 0;

  for (let t = 0; t <= curve.duration; t += 1) {
    peak = Math.max(peak, curve.at(t));
  }

  const step = Math.max(1, Math.round(curve.duration / 90));

  for (let t = 0; t < curve.duration; t += step) {
    points.push([t, curve.at(t)]);
  }

  points.push([curve.duration, 1]);

  return { settle: curve.duration, peak, points };
}

function springChart(
  token: string,
  summary: string,
  spring: typeof DEFAULT_SPRING,
  delay = 0,
): string {
  const shift = (stats: ReturnType<typeof springStats>) => ({
    ...stats,
    settle: stats.settle + delay,
    points: (delay ? ([[0, 0]] as [number, number][]) : []).concat(
      stats.points.map(([t, v]) => [t + delay, v] as [number, number]),
    ),
  });
  const stats = shift(springStats(spring));
  const base = shift(springStats(DEFAULT_SPRING));
  const isDefault =
    spring.damping === DEFAULT_SPRING.damping &&
    spring.stiffness === DEFAULT_SPRING.stiffness &&
    spring.mass === DEFAULT_SPRING.mass;
  const xMax = Math.max(stats.settle, isDefault ? 0 : base.settle) * 1.05;
  const yMax = Math.max(1.12, stats.peak, isDefault ? 0 : base.peak) + 0.06;
  const line = curvePath(stats.points, xMax, -0.05, yMax);
  const w = CHART_W - PLOT.l - PLOT.r;
  const h = CHART_H - PLOT.t - PLOT.b;
  const settleX = round(PLOT.l + (stats.settle / xMax) * w);
  const overshoot = Math.round((stats.peak - 1) * 100);

  return chart(
    title(token, summary) +
      plotWait(delay, xMax) +
      curveAxes(-0.05, yMax, `${Math.round(xMax)}ms`) +
      (isDefault
        ? ""
        : dashed(curvePath(base.points, xMax, -0.05, yMax)) +
          text(CHART_W - PLOT.r, PLOT.t + 6 + h * 0.45, "- - default spring", {
            anchor: "end",
          })) +
      solid(line) +
      `<line x1="${settleX}" x2="${settleX}" y1="${PLOT.t}" y2="${CHART_H - PLOT.b}" stroke="${SETTLED}" stroke-dasharray="2 2"/>` +
      text(settleX - 4, CHART_H - PLOT.b - 6, `stops ${stats.settle}ms`, {
        anchor: "end",
      }) +
      text(
        CHART_W - PLOT.r,
        PLOT.t - 6,
        overshoot > 0 ? `overshoots ${overshoot}%` : "no overshoot",
        { anchor: "end" },
      ) +
      tracer(line, Math.max(1200, stats.settle * 2)),
    delay ? HATCH : "",
  );
}

function xOnLine(ms: number, max: number): number {
  return round(LINE.l + (ms / max) * (CHART_W - LINE.l - LINE.r));
}

function ruler(max: number, y: number): string {
  const step = max <= 600 ? 100 : max <= 1200 ? 200 : max <= 3000 ? 500 : 1000;
  let out = `<line x1="${LINE.l}" x2="${CHART_W - LINE.r}" y1="${y}" y2="${y}" stroke="${COLORS.mute}" stroke-opacity="0.5"/>`;

  for (let t = 0; t <= max; t += step) {
    const x = xOnLine(t, max);
    out +=
      `<line x1="${x}" x2="${x}" y1="${y - 3}" y2="${y + 3}" stroke="${COLORS.mute}"/>` +
      text(x, y + 14, t, {
        anchor: t === 0 ? "start" : t + step > max ? "end" : "middle",
      });
  }

  return out;
}

function bar(
  from: number,
  to: number,
  y: number,
  height: number,
  options: { fill?: string; opacity?: number; dashed?: boolean } = {},
): string {
  const fill = options.fill ?? COLORS.card;

  return `<rect x="${from}" y="${y}" width="${Math.max(2, round(to - from))}" height="${height}" rx="4" fill="${fill}" fill-opacity="${options.opacity ?? 0.95}"${
    options.dashed ? ` stroke="${fill}" stroke-dasharray="3 2"` : ""
  }/>`;
}

const HATCH = `<pattern id="h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="${WAIT}" fill-opacity="0.6"/></pattern>`;

function waitBar(from: number, to: number, y: number, height: number): string {
  return `<rect x="${from}" y="${y}" width="${Math.max(2, round(to - from))}" height="${height}" rx="4" fill="url(#h)" stroke="${WAIT}" stroke-opacity="0.8"/>`;
}

/** A vertical line sweeping across a timeline. */
function playhead(total: number, max: number, y1: number, y2: number): string {
  const end = xOnLine(total, max);
  const values = `${LINE.l};${end};${end}`;
  const timing = `keyTimes="0;0.75;1" dur="${round(Math.max(1200, total * 1.5))}ms" repeatCount="indefinite"`;

  return (
    `<line class="m" x1="${LINE.l}" x2="${LINE.l}" y1="${y1}" y2="${y2}" stroke="${COLORS.card}" stroke-width="1.5">` +
    `<animate attributeName="x1" values="${values}" ${timing}/>` +
    `<animate attributeName="x2" values="${values}" ${timing}/>` +
    `</line>`
  );
}

const niceMax = (ms: number, step: number, min: number) =>
  Math.max(min, Math.ceil(ms / step) * step);

function durationChart(
  token: string,
  ms: number,
  ctx: GroupTiming = DEFAULT_GROUP,
): string {
  const delay = ctx.delay;
  const base = ctx.baseDuration;
  const max = niceMax(delay + Math.max(ms, base), 250, 1000);
  const ratio = ms / base;
  const times = (value: number) => value.toFixed(1).replace(/\.0$/, "");
  const summary = ctx.spring
    ? "ignored: group uses a spring"
    : ms === base
      ? `same as ${base}ms`
      : `${times(ratio > 1 ? ratio : 1 / ratio)}× ${ratio > 1 ? "longer" : "shorter"} than ${base}ms`;
  const start = xOnLine(delay, max);
  const end = xOnLine(delay + ms, max);
  const label = delay ? `${ms}ms · ends ${delay + ms}ms` : `${ms}ms`;
  const labelInside = end + label.length * 6.2 + 4 > CHART_W - LINE.r;

  return chart(
    title(token, summary) +
      text(LINE.l, 44, `${ctx.baseSource} ${base}ms`) +
      (delay ? waitBar(LINE.l, start, 50, 12) : "") +
      bar(start + (delay ? 2 : 0), xOnLine(delay + base, max), 50, 12, {
        fill: COLORS.mute,
        opacity: 0.35,
        dashed: true,
      }) +
      text(LINE.l, 82, delay ? `this token, after delay ${delay}ms` : "this token", {
        cls: "k",
      }) +
      (delay ? waitBar(LINE.l, start, 88, 16) : "") +
      bar(start + (delay ? 2 : 0), end, 88, 16) +
      text(labelInside ? end - 4 : end + 4, 100, label, {
        cls: labelInside ? undefined : "k",
        anchor: labelInside ? "end" : "start",
        fill: labelInside ? "#fff" : undefined,
      }) +
      ruler(max, 122) +
      playhead(delay + ms, max, 84, 108),
    delay ? HATCH : "",
  );
}

function delayChart(token: string, ms: number, ctx: GroupTiming = DEFAULT_GROUP): string {
  const motion = playLength(ctx);
  const source = ctx.spring ? "spring settles" : ctx.durationSource;
  const max = niceMax(ms + motion, 200, 600);
  const start = xOnLine(ms, max);
  const end = xOnLine(ms + motion, max);

  return chart(
    title(token, "waits, then moves") +
      waitBar(LINE.l, start, 54, 22) +
      text(LINE.l, 46, `wait ${ms}ms`, { cls: "w" }) +
      bar(start + 2, end, 54, 22) +
      text(end, 46, `motion ${motion}ms`, { cls: "k", anchor: "end" }) +
      text(Math.min(Math.max((start + end) / 2, 70), CHART_W - 70), 90, `from ${source}`, {
        anchor: "middle",
      }) +
      text(LINE.l, 108, `starts at ${ms}ms · ends at ${ms + motion}ms`) +
      ruler(max, 124) +
      playhead(ms + motion, max, 50, 80),
    HATCH,
  );
}

function playChart(token: string, plays: number, ctx: GroupTiming = DEFAULT_GROUP): string {
  const infinite = plays === Infinity;
  const count = infinite ? 4 : Math.min(plays, 8);
  const each = playLength(ctx);
  const delay = ctx.delay;
  const overflow = infinite || plays > count;
  // Leave room after the bars for the "∞ …" or "…" marker.
  const max = niceMax((delay + count * each) * (overflow ? 1.15 : 1), 250, 1000);
  let bars = delay ? waitBar(LINE.l, xOnLine(delay, max), 60, 22) : "";

  for (let i = 0; i < count; i += 1) {
    const from = xOnLine(delay + i * each, max) + 1;
    const to = xOnLine(delay + (i + 1) * each, max) - 1;
    bars +=
      bar(from, to, 60, 22, { opacity: infinite ? 0.95 - i * 0.22 : 0.95 }) +
      text((from + to) / 2, 75, i + 1, { anchor: "middle", fill: "#fff" });
  }

  const after = xOnLine(delay + count * each, max) + 6;

  return chart(
    title(
      token,
      infinite
        ? "repeats until removed"
        : `${plays} × ${each}ms${delay ? ` + ${delay}ms delay` : ""} = ${delay + plays * each}ms`,
    ) +
      bars +
      (infinite ? text(after, 76, "∞ …", { cls: "k" }) : "") +
      (plays > count && !infinite ? text(after, 76, "…", { cls: "k" }) : "") +
      text(
        LINE.l,
        104,
        `each play: ${each}ms from ${ctx.spring ? "spring settle" : ctx.durationSource}`,
      ) +
      ruler(max, 122),
    delay ? HATCH : "",
  );
}

/**
 * Draws a timing token as a chart, or returns `undefined` for tokens that
 * change shape rather than timing.
 */
export function timingSvg(
  token: string,
  metadata: TokenMetadata,
  ctx: GroupTiming = DEFAULT_GROUP,
): string | undefined {
  const label = token.replace(/\{number\}$/, "");

  if (EASINGS[label] && metadata.easings.some((easing) => easing.token === label)) {
    return easingChart(label, ctx);
  }

  if (label === metadata.spring.token) {
    return springChart(
      label,
      `damping ${DEFAULT_SPRING.damping} · stiffness ${DEFAULT_SPRING.stiffness}`,
      DEFAULT_SPRING,
      ctx.delay,
    );
  }

  const timing = [...metadata.numericTiming, ...metadata.countTiming].find(
    (candidate) => label.startsWith(candidate.prefix),
  );

  if (!timing) {
    return undefined;
  }

  const full = label === timing.prefix ? timing.example : label;
  const raw = full.slice(timing.prefix.length);

  if (timing.prefix === "play-" || timing.prefix === "repeat-") {
    const plays = raw === "infinite" ? Infinity : Number(raw);
    return plays === Infinity || (Number.isInteger(plays) && plays > 0)
      ? playChart(full, plays, ctx)
      : undefined;
  }

  if (!NUMBER.test(raw)) {
    return undefined;
  }

  const value = Number(raw);

  switch (timing.prefix) {
    case "duration-":
      return value > 0 ? durationChart(full, value, ctx) : undefined;
    case "delay-":
      return delayChart(full, value, ctx);
    case "damping-":
      return value > 0
        ? springChart(
            full,
            value < DEFAULT_SPRING.damping
              ? "bouncier"
              : value > DEFAULT_SPRING.damping
                ? "calmer"
                : "default",
            { ...DEFAULT_SPRING, damping: value },
            ctx.delay,
          )
        : undefined;
    case "stiffness-":
      return value > 0
        ? springChart(
            full,
            value > DEFAULT_SPRING.stiffness
              ? "snappier"
              : value < DEFAULT_SPRING.stiffness
                ? "softer"
                : "default",
            { ...DEFAULT_SPRING, stiffness: value },
            ctx.delay,
          )
        : undefined;
    case "mass-":
      return value > 0
        ? springChart(
            full,
            value > DEFAULT_SPRING.mass
              ? "heavier, slower"
              : value < DEFAULT_SPRING.mass
                ? "lighter, faster"
                : "default",
            { ...DEFAULT_SPRING, mass: value },
            ctx.delay,
          )
        : undefined;
    default:
      return undefined;
  }
}

/**
 * When an animate value has several comma groups, draws one timeline row
 * per group so overlaps and end times are visible. Returns `undefined` for
 * fewer than two timed groups.
 */
export function timelineSvg(
  value: string,
  metadata: TokenMetadata,
): string | undefined {
  const labels = value
    .split(",")
    .map((group) => group.trim().split(/\s+/).filter(Boolean))
    .filter((tokens) => tokens.length > 0);
  const groups = resolve(value, metadata);
  const rows: { label: string; delay: number; length: number; loop: boolean }[] = [];

  groups.forEach((group, index) => {
    const moves = Object.keys(group.from).some(
      (key) =>
        group.from[key as Channel] !== undefined &&
        group.to[key as Channel] !== undefined &&
        group.from[key as Channel] !== group.to[key as Channel],
    );

    if (!moves) {
      return;
    }

    const tokens = labels[index] ?? [];
    const shape = tokens.filter(
      (token) => !timingSvg(token, metadata) && !/^(layout|transition)/.test(token),
    );
    const plays = group.timing.play === Infinity ? 1 : group.timing.play;

    rows.push({
      label: (shape.join(" ") || tokens.join(" ")).slice(0, 26),
      delay: group.timing.delay,
      length: curveFor(group.timing).duration * plays,
      loop: group.timing.play === Infinity,
    });
  });

  if (rows.length < 2) {
    return undefined;
  }

  const shown = rows.slice(0, 3);
  const end = Math.max(...shown.map((row) => row.delay + row.length));
  const max = niceMax(end, 200, 400);
  let body = text(12, 18, "Whole value timeline", { cls: "k" });

  shown.forEach((row, index) => {
    const y = 34 + index * 30;
    const start = xOnLine(row.delay, max);
    const finish = xOnLine(row.delay + row.length, max);

    body += text(LINE.l, y + 4, row.label);
    body += text(
      CHART_W - LINE.r,
      y + 4,
      `${row.delay}–${Math.round(row.delay + row.length)}ms${row.loop ? " ∞" : ""}`,
      { anchor: "end" },
    );

    if (row.delay) {
      body += waitBar(LINE.l, start, y + 9, 12);
    }

    body += bar(start + 1, finish, y + 9, 12);
  });

  return chart(
    body + ruler(max, 128) + playhead(end, max, 40, 34 + shown.length * 30),
    HATCH,
  );
}

/** The preview for one token: a timing chart, or an animated card. */
export function tokenPreviewSvg(
  token: string,
  metadata: TokenMetadata,
): string | undefined {
  const chartSvg = timingSvg(token, metadata);

  if (chartSvg) {
    return chartSvg;
  }

  const sample = sampleFor(token, metadata);

  return sample ? previewSvg(sample, metadata) : undefined;
}

const SLOT_ALIASES: Record<string, string> = { "repeat-": "play-" };
const SPRING_ONLY = ["damping-", "stiffness-", "mass-"];

/**
 * Reads a timing token, or a completion label such as `duration-{number}`,
 * as a full token plus the slot it fills in a group (easing, `duration-`,
 * `play-`, ...). Returns `undefined` for tokens that aren't about timing.
 */
function readTiming(
  token: string,
  metadata: TokenMetadata,
): { full: string; slot: string } | undefined {
  const label = token.replace(/\{number\}$/, "");

  if (
    label === metadata.spring.token ||
    metadata.easings.some((easing) => easing.token === label)
  ) {
    return { full: label, slot: "easing" };
  }

  const timing = [...metadata.numericTiming, ...metadata.countTiming].find(
    (candidate) => label.startsWith(candidate.prefix),
  );

  if (!timing) {
    return undefined;
  }

  return {
    full: label === timing.prefix ? timing.example : label,
    slot: SLOT_ALIASES[timing.prefix] ?? timing.prefix,
  };
}

/**
 * Markdown previews for one token, taking the rest of its comma group into
 * account so the preview shows what the group will actually do:
 *
 * - a shape token (`slide-up`, `from:...`, `layout-*`, ...) plays with the
 *   group's timing tokens, so `duration-800 delay-200` visibly slows it;
 * - a timing token gets its chart, then the group's shape played with that
 *   timing (replacing any token in the same slot).
 *
 * `groupTokens` are the other valid tokens in the same comma group.
 */
export function tokenPreviewMarkdown(
  token: string,
  metadata: TokenMetadata,
  groupTokens: readonly string[] = [],
): string {
  const timings = groupTokens
    .map((text) => readTiming(text, metadata))
    .filter((timing): timing is { full: string; slot: string } => !!timing);
  const shapes = groupTokens.filter(
    (text) => !readTiming(text, metadata) && sampleFor(text, metadata),
  );
  const own = readTiming(token, metadata);

  if (own) {
    const context = [
      ...shapes,
      ...timings.filter((timing) => timing.slot !== own.slot).map((timing) => timing.full),
      own.full,
    ];
    const ctx = groupTiming(context, metadata);
    let markdown = previewMarkdown(timingSvg(token, metadata, ctx));
    const notes: string[] = [];

    if (ctx.spring && (own.slot === "duration-" || (own.slot === "easing" && own.full !== metadata.spring.token))) {
      notes.push(`Springs ignore \`duration-*\` and easing tokens; this group uses a spring.`);
    } else if (ctx.spring && ctx.durationToken && SPRING_ONLY.concat("easing").includes(own.slot)) {
      notes.push(`\`${ctx.durationToken}\` has no effect once the group uses a spring.`);
    }

    if (notes.length > 0) {
      markdown += `\n\n${notes.join(" ")}`;
    }

    if (shapes.length > 0) {
      const applied = [
        ...shapes,
        ...timings.filter((timing) => timing.slot !== own.slot).map((timing) => timing.full),
        own.full,
      ].join(" ");
      const card = previewSvg(applied, metadata);
      const springless =
        SPRING_ONLY.includes(own.slot) &&
        !/\bspring\b/.test(applied) &&
        !metadata.presets.some(
          (preset) => shapes.includes(preset.name) && preset.motion.startsWith("spring"),
        );

      if (card) {
        markdown += `\n\nIn this group: \`${applied}\`${
          springless ? " (add `spring` for this to take effect)" : ""
        }\n\n${previewMarkdown(card)}`;
      }
    }

    return markdown;
  }

  const sample = sampleFor(token, metadata);

  if (!sample) {
    return "";
  }

  const extra = timings.map((timing) => timing.full);
  const card = previewSvg([sample, ...extra].join(" "), metadata);

  if (!card) {
    return "";
  }

  return extra.length > 0
    ? `With this group's timing: \`${extra.join(" ")}\`\n\n${previewMarkdown(card)}`
    : previewMarkdown(card);
}

/** The preview for a whole animate value: a timeline, or an animated card. */
export function valuePreviewSvg(
  value: string,
  metadata: TokenMetadata,
): string | undefined {
  return timelineSvg(value, metadata) ?? previewSvg(value, metadata);
}

/** Markdown image for a preview, or an empty string. */
export function previewMarkdown(svg: string | undefined): string {
  if (!svg) {
    return "";
  }

  const data = Buffer.from(svg, "utf8").toString("base64");

  return `![Animation preview](data:image/svg+xml;base64,${data})`;
}
