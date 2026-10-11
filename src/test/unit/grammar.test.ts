import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyze, analyzePresetName, tokenize } from "../../grammar";
import { makeContext } from "./fixtures";

const context = makeContext(["pop-in"]);

function issues(value: string) {
  return analyze(value, context)
    .filter((token) => token.issue)
    .map((token) => ({ text: token.text, ...token.issue }));
}

describe("tokenize", () => {
  it("splits groups on commas and tokens on whitespace", () => {
    assert.deepEqual(
      tokenize("fade-in duration-300,slide-up").map((token) => [
        token.text,
        token.group,
        token.start,
      ]),
      [
        ["fade-in", 0, 0],
        ["duration-300", 0, 8],
        ["slide-up", 1, 21],
      ],
    );
  });
});

describe("analyze", () => {
  it("accepts a valid v1 token string", () => {
    assert.deepEqual(
      issues(
        "fade-in from:-translate-y-8 to:opacity-100 exit:scale-90 layout-spring transition-colors duration-300 delay-50 ease-in play-2, bounce spring damping-12 stiffness-180 mass-0.5 repeat-infinite",
      ),
      [],
    );
  });

  it("classifies token kinds", () => {
    assert.deepEqual(
      analyze("fade-in from:opacity-0 layout-linear transition duration-1", context).map(
        (token) => token.kind,
      ),
      ["preset", "keyframe", "layout", "transition", "timing"],
    );
  });

  it("accepts presets registered with definePreset", () => {
    assert.deepEqual(issues("pop-in"), []);
  });

  it("allows one preset per group", () => {
    assert.deepEqual(issues("fade-in slide-up"), [
      {
        text: "slide-up",
        message:
          'Only one preset is allowed per group; "slide-up" is ignored. Separate presets with commas.',
        needsComma: true,
      },
    ]);
    assert.deepEqual(issues("fade-in, slide-up"), []);
  });

  it("suggests close matches for unknown tokens", () => {
    assert.equal(issues("fade-inn")[0]?.suggestion, "fade-in");
    assert.equal(issues("layout-sprng")[0]?.suggestion, "layout-spring");
    assert.equal(issues("from:opacty-0")[0]?.suggestion, "from:opacity-0");
  });

  it("rejects invalid numbers like the library parser", () => {
    for (const token of [
      "duration-fast",
      "delay--1",
      "play-0",
      "play-1.5",
      "from:translate-x-1e3",
      "from:-opacity-50",
      "from:-scale-50",
      "from:w-",
    ]) {
      assert.equal(issues(`fade-in ${token}`).length, 1, token);
    }
  });

  it("validates object preset names", () => {
    assert.equal(analyzePresetName("fade-in", context), undefined);
    assert.equal(analyzePresetName("fade-inn", context)?.suggestion, "fade-in");
  });
});
