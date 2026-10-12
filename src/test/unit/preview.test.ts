import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeHover } from "../../hover";
import {
  previewMarkdown,
  previewSvg,
  sampleFor,
  timelineSvg,
  timingSvg,
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
    assert.match(timingSvg("duration-500", metadata)!, /1\.7× longer than default/);
    assert.match(timingSvg("duration-150", metadata)!, /2× shorter than default/);
    assert.match(timingSvg("duration-{number}", metadata)!, /same as default/);
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
    assert.match(timingSvg("play-3", metadata)!, /3 plays × 300ms = 900ms/);
    assert.match(timingSvg("play-infinite", metadata)!, /repeats until removed/);
    assert.match(timingSvg("repeat-2", metadata)!, /2 plays/);
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
