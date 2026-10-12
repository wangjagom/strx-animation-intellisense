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

/** A base motion that makes timing tokens visible. */
const TIMING_BASE = "from:-translate-x-60";

/**
 * Maps a single token (or a completion label such as `duration-{number}` or
 * `from:`) to an animate string that demonstrates it.
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

  if (
    metadata.easings.some((easing) => easing.token === text) ||
    text === metadata.spring.token
  ) {
    return `${TIMING_BASE} ${text}`;
  }

  const timing = [...metadata.numericTiming, ...metadata.countTiming].find(
    (candidate) => text.startsWith(candidate.prefix),
  );

  if (!timing) {
    return undefined;
  }

  const full = text === timing.prefix ? timing.example : text;
  const springOnly = ["damping-", "stiffness-", "mass-"].includes(timing.prefix);

  return `${TIMING_BASE} ${full}${springOnly ? " spring" : ""}`;
}

/** Markdown image for a preview, or an empty string. */
export function previewMarkdown(svg: string | undefined): string {
  if (!svg) {
    return "";
  }

  const data = Buffer.from(svg, "utf8").toString("base64");

  return `![Animation preview](data:image/svg+xml;base64,${data})`;
}
