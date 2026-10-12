import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeHover } from "../../hover";
import { previewMarkdown, previewSvg, sampleFor } from "../../preview";
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
    assert.equal(
      sampleFor("ease-in", metadata),
      "from:-translate-x-60 ease-in",
    );
    assert.equal(
      sampleFor("duration-{number}", metadata),
      "from:-translate-x-60 duration-300",
    );
    assert.equal(
      sampleFor("damping-20", metadata),
      "from:-translate-x-60 damping-20 spring",
    );
    assert.equal(
      sampleFor("play-infinite", metadata),
      "from:-translate-x-60 play-infinite",
    );
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
