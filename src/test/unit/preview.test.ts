import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeCompletions } from "../../completion";
import { computeHover } from "../../hover";
import {
  previewMarkdown,
  previewSvg,
  sampleFor,
  groupTiming,
  timelineSvg,
  timingSvg,
  tokenPreviewMarkdown,
  tokenPreviewSvg,
  valuePreviewSvg,
} from "../../preview";
import { makeContext } from "./fixtures";

const context = makeContext(["pop-in"]);
const { metadata } = context;

function decode(markdown: string): string {
  const match = /base64,([A-Za-z0-9+/=]+)\)$/.exec(markdown);
  assert.ok(match, markdown);
  return Buffer.from(match[1], "base64").toString("utf8");
}

describe("sampleFor", () => {
  it("demonstrates each kind of completion", () => {
    assert.equal(sampleFor("slide-up", metadata), "slide-up");
    assert.equal(sampleFor("layout-spring", metadata), "layout-spring");
    assert.equal(sampleFor("transition-colors", metadata), "transition-colors");
    assert.equal(
      sampleFor("from:", metadata),
      "from:opacity-0 from:translate-y-20",
    );
    assert.equal(
      sampleFor("exit:-translate-x-{number}", metadata),
      "exit:-translate-x-20",
    );
  });

  it("leaves timing tokens to the timing charts", () => {
    for (const token of ["ease-in", "spring", "duration-500", "play-3"]) {
      assert.equal(sampleFor(token, metadata), undefined, token);
    }
  });

  it("has no sample for custom presets", () => {
    assert.equal(sampleFor("pop-in", metadata), undefined);
  });
});

describe("previewSvg", () => {
  it("uses the preset's own timing", () => {
    const svg = previewSvg("slide-up", metadata)!;

    assert.match(svg, /320ms ease-out/);
    assert.match(svg, /@keyframes c\{0%\{transform:translate\(0px,24px\)/);
    assert.match(svg, /prefers-reduced-motion/);
  });

  it("simulates springs", () => {
    assert.match(previewSvg("bounce", metadata)!, /spring d8 s180 m0\.9/);
    assert.match(
      previewSvg("layout-spring", metadata)!,
      /layout-spring · spring d15 s120 m1/,
    );
  });

  it("applies group timing tokens", () => {
    const svg = previewSvg("fade-in duration-800 delay-200 ease-in-out", metadata)!;

    assert.match(svg, /800ms ease-in-out · delay 200ms/);
  });

  it("plays exits from the resting state", () => {
    const svg = previewSvg("exit:opacity-0 exit:translate-y-20", metadata)!;

    assert.match(svg, /exit · 300ms ease/);
    assert.match(svg, /0%\{transform:none;opacity:1\}/);
  });

  it("scales large moves into the stage", () => {
    const svg = previewSvg("from:translate-y-600", metadata)!;

    assert.match(svg, /0%\{transform:translate\(0px,40px\)/);
  });

  it("shows a style change for transitions", () => {
    const svg = previewSvg("transition-colors duration-150", metadata)!;

    assert.match(svg, /@keyframes b\{/);
    assert.match(svg, /fill:#16a34a/);
    assert.match(svg, /150ms ease-out/);
  });

  it("returns nothing for values without motion", () => {
    assert.equal(previewSvg("pop-in", metadata), undefined);
    assert.equal(previewSvg("", metadata), undefined);
    assert.equal(previewMarkdown(undefined), "");
  });

  it("encodes previews as data images", () => {
    const markdown = previewMarkdown(previewSvg("fade-in", metadata));

    assert.match(markdown, /^!\[Animation preview\]\(data:image\/svg\+xml;base64,/);
    assert.match(decode(markdown), /^<svg /);
  });
});

describe("timingSvg", () => {
  it("draws easings over the default curve", () => {
    const svg = timingSvg("ease-in-out", metadata)!;

    assert.match(svg, /slow start and slow end/);
    assert.match(svg, /ease-out \(default\)/);
    assert.match(svg, /animateMotion/);
    assert.match(timingSvg("ease-out", metadata)!, /this is the default/);
  });

  it("compares durations with the default", () => {
    assert.match(timingSvg("duration-500", metadata)!, /1\.7× longer than 300ms/);
    assert.match(timingSvg("duration-150", metadata)!, /2× shorter than 300ms/);
    assert.match(timingSvg("duration-{number}", metadata)!, /same as 300ms/);
    assert.equal(timingSvg("duration-0", metadata), undefined);
  });

  it("splits delays into waiting and moving", () => {
    assert.match(timingSvg("delay-200", metadata)!, /starts at 200ms · ends at 500ms/);
  });

  it("charts springs with overshoot and settle time", () => {
    const base = timingSvg("spring", metadata)!;
    const bouncy = timingSvg("damping-4", metadata)!;

    assert.match(base, /overshoots \d+%/);
    assert.match(base, /stops \d+ms/);
    assert.doesNotMatch(base, /default spring/);
    assert.match(bouncy, /bouncier/);
    assert.match(bouncy, /default spring/);
    assert.match(timingSvg("stiffness-300", metadata)!, /snappier/);
    assert.match(timingSvg("mass-3", metadata)!, /heavier, slower/);
  });

  it("repeats bars for play counts", () => {
    assert.match(timingSvg("play-3", metadata)!, /3 × 300ms = 900ms/);
    assert.match(timingSvg("play-infinite", metadata)!, /repeats until removed/);
    assert.match(timingSvg("repeat-2", metadata)!, /2 × 300ms = 600ms/);
  });

  it("ignores shape tokens", () => {
    assert.equal(timingSvg("fade-in", metadata), undefined);
    assert.equal(timingSvg("layout-spring", metadata), undefined);
  });
});

describe("token and value previews", () => {
  it("picks a chart for timing tokens and a card otherwise", () => {
    assert.match(tokenPreviewSvg("delay-200", metadata)!, /waits, then moves/);
    assert.match(tokenPreviewSvg("slide-up", metadata)!, /@keyframes c\{/);
    assert.equal(tokenPreviewSvg("pop-in", metadata), undefined);
  });

  it("draws a timeline for several timed groups", () => {
    const svg = timelineSvg(
      "fade-in duration-200, slide-up delay-150 duration-500 ease-in-out",
      metadata,
    )!;

    assert.match(svg, /Whole value timeline/);
    assert.match(svg, /0–200ms/);
    assert.match(svg, /150–650ms/);
    assert.equal(timelineSvg("fade-in duration-200", metadata), undefined);
    assert.match(valuePreviewSvg("fade-in from:translate-y-12", metadata)!, /@keyframes c\{/);
  });
});

describe("group-aware previews", () => {
  const images = (markdown: string) =>
    markdown.match(/!\[Animation preview\]/g)?.length ?? 0;
  const svgs = (markdown: string) =>
    [...markdown.matchAll(/base64,([A-Za-z0-9+/=]+)\)/g)].map((match) =>
      Buffer.from(match[1], "base64").toString("utf8"),
    );

  it("plays a shape token with the group's timing", () => {
    const markdown = tokenPreviewMarkdown("slide-up", metadata, [
      "duration-800",
      "delay-200",
    ]);

    assert.match(markdown, /With this group's timing: `duration-800 delay-200`/);
    assert.match(svgs(markdown)[0], /800ms ease-out · delay 200ms/);
  });

  it("ignores other shape tokens and keeps the default without timing", () => {
    const markdown = tokenPreviewMarkdown("slide-up", metadata, ["from:opacity-0"]);

    assert.doesNotMatch(markdown, /this group/);
    assert.match(svgs(markdown)[0], /320ms ease-out/);
  });

  it("adds the group's shape under a timing chart, replacing the same slot", () => {
    const markdown = tokenPreviewMarkdown("duration-500", metadata, [
      "slide-up",
      "duration-300",
      "ease-in-out",
    ]);
    const [chart, card] = svgs(markdown);

    assert.equal(images(markdown), 2);
    assert.match(chart, /1\.6× longer than slide-up default|1\.6× longer than 320ms/);
    assert.match(markdown, /In this group: `slide-up ease-in-out duration-500`/);
    assert.match(card, /500ms ease-in-out/);
  });

  it("swaps easings and notes spring values without a spring", () => {
    const easing = tokenPreviewMarkdown("linear", metadata, ["fade-in", "ease-in"]);
    const springless = tokenPreviewMarkdown("damping-4", metadata, ["fade-in"]);
    const spring = tokenPreviewMarkdown("damping-4", metadata, ["bounce"]);

    assert.match(easing, /In this group: `fade-in linear`/);
    assert.match(springless, /add `spring` for this to take effect/);
    assert.doesNotMatch(spring, /add `spring`/);
  });

  it("shows only the chart when the group has no shape", () => {
    const markdown = tokenPreviewMarkdown("delay-200", metadata, ["ease-in"]);

    assert.equal(images(markdown), 1);
  });

  it("passes the group to completion items", () => {
    const items = computeCompletions("slide-up duration-800 ", 22, context).items;

    assert.deepEqual(items[0].groupTokens, ["slide-up", "duration-800"]);
  });

  it("uses the group in hovers", () => {
    const hover = computeHover("slide-up duration-800, fade-in", 2, context, {
      previews: true,
    })!;

    assert.match(hover.markdown, /With this group's timing: `duration-800`/);
  });
});

describe("connected timing", () => {
  const svgs = (markdown: string) =>
    [...markdown.matchAll(/base64,([A-Za-z0-9+/=]+)\)/g)].map((match) =>
      Buffer.from(match[1], "base64").toString("utf8"),
    );

  it("resolves a group's timing and where it comes from", () => {
    const ctx = groupTiming(["slide-up", "duration-1000", "delay-200"], metadata);

    assert.equal(ctx.delay, 200);
    assert.equal(ctx.duration, 1000);
    assert.equal(ctx.durationSource, "duration-1000");
    assert.equal(ctx.baseDuration, 320);
    assert.equal(ctx.baseSource, "slide-up default");
  });

  it("draws a delay with the group's duration", () => {
    const [chart] = svgs(
      tokenPreviewMarkdown("delay-200", metadata, ["slide-up", "duration-1000"]),
    );

    assert.match(chart, /motion 1000ms/);
    assert.match(chart, /from duration-1000/);
    assert.match(chart, /starts at 200ms · ends at 1200ms/);
  });

  it("draws a duration after the group's delay, against the preset default", () => {
    const [chart] = svgs(
      tokenPreviewMarkdown("duration-1000", metadata, ["slide-up", "delay-200"]),
    );

    assert.match(chart, /3\.1× longer than 320ms/);
    assert.match(chart, /slide-up default 320ms/);
    assert.match(chart, /after delay 200ms/);
    assert.match(chart, /1000ms · ends 1200ms/);
  });

  it("stretches easing curves over the group's delay and duration", () => {
    const [chart] = svgs(
      tokenPreviewMarkdown("ease-in-out", metadata, ["slide-up", "duration-1000", "delay-200"]),
    );

    assert.match(chart, /wait 200ms/);
    assert.match(chart, /1000ms from duration-1000/);
    assert.match(chart, />1200ms</);
  });

  it("repeats the group's duration after its delay", () => {
    const [chart] = svgs(
      tokenPreviewMarkdown("play-3", metadata, ["slide-up", "duration-1000", "delay-200"]),
    );

    assert.match(chart, /3 × 1000ms \+ 200ms delay = 3200ms/);
    assert.match(chart, /each play: 1000ms from duration-1000/);
  });

  it("explains timing that springs ignore", () => {
    const duration = tokenPreviewMarkdown("duration-500", metadata, ["bounce"]);
    const damping = tokenPreviewMarkdown("damping-4", metadata, ["scale-in", "spring", "duration-800"]);

    assert.match(duration, /Springs ignore `duration-\*`/);
    assert.match(svgs(duration)[0], /ignored: group uses a spring/);
    assert.match(damping, /`duration-800` has no effect once the group uses a spring/);
    assert.match(
      svgs(tokenPreviewMarkdown("delay-100", metadata, ["bounce"]))[0],
      /from spring settles/,
    );
  });
});

describe("hover previews", () => {
  it("adds the token and whole-value previews when enabled", () => {
    const value = "fade-in from:translate-y-12 spring";
    const hover = computeHover(value, 2, context, { previews: true })!;
    const images = hover.markdown.match(/!\[Animation preview\]/g) ?? [];

    assert.equal(images.length, 2);
    assert.match(hover.markdown, /Whole value `fade-in from:translate-y-12 spring`/);
  });

  it("skips the whole-value preview for a single token or invalid values", () => {
    const single = computeHover("fade-in", 2, context, { previews: true })!;
    const invalid = computeHover("fade-in fade-inn", 2, context, {
      previews: true,
    })!;

    assert.equal(single.markdown.match(/!\[Animation preview\]/g)?.length, 1);
    assert.equal(invalid.markdown.match(/!\[Animation preview\]/g)?.length, 1);
  });

  it("adds no previews by default", () => {
    const hover = computeHover("fade-in", 2, context)!;

    assert.doesNotMatch(hover.markdown, /Animation preview/);
  });
});
