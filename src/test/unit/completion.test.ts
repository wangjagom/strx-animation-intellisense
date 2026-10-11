import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeCompletions } from "../../completion";
import { computeHover } from "../../hover";
import { findDefinedPresets } from "../../customPresets";
import { makeContext } from "./fixtures";

const context = makeContext(["pop-in"]);

function complete(value: string, offset = value.length) {
  return computeCompletions(value, offset, context);
}

function labels(value: string, offset?: number) {
  return complete(value, offset).items.map((item) => item.label);
}

describe("computeCompletions", () => {
  it("offers v1 tokens including spring and play", () => {
    const items = labels("");

    for (const label of [
      "fade-in",
      "pop-in",
      "from:",
      "layout-spring",
      "transition-colors",
      "ease-out",
      "spring",
      "damping-{number}",
      "play-{number}",
      "play-infinite",
    ]) {
      assert.ok(items.includes(label), label);
    }
  });

  it("marks repeat-* as legacy", () => {
    const repeat = complete("").items.find(
      (item) => item.label === "repeat-{number}",
    );

    assert.equal(repeat?.deprecated, true);
    assert.equal(repeat?.category, "legacy");
  });

  it("omits presets once the group has one, but offers them after a comma", () => {
    assert.ok(!labels("fade-in ").includes("slide-up"));
    assert.ok(labels("fade-in, ").includes("slide-up"));
  });

  it("omits categories already used in the group", () => {
    const items = labels("layout-spring transition-all ease-in duration-200 ");

    assert.ok(!items.includes("layout-linear"));
    assert.ok(!items.includes("transition-colors"));
    assert.ok(!items.includes("linear"));
    assert.ok(!items.includes("duration-{number}"));
    assert.ok(items.includes("delay-{number}"));
  });

  it("replaces only the current token, using commas as boundaries", () => {
    const result = complete("fade-in,sli");

    assert.equal(result.replaceStart, 8);
    assert.equal(result.replaceEnd, 11);
  });

  it("replaces the whole token when the cursor is inside it", () => {
    const result = complete("fade-in slide-up", 10);

    assert.equal(result.replaceStart, 8);
    assert.equal(result.replaceEnd, 16);
  });

  it("offers utilities after keyframe prefixes, with signed variants", () => {
    const items = labels("from:");

    assert.ok(items.includes("from:opacity-{number}"));
    assert.ok(items.includes("from:-translate-y-{number}"));
    assert.ok(!items.includes("from:-opacity-{number}"));
  });
});

describe("computeHover", () => {
  it("describes presets", () => {
    const hover = computeHover("bounce duration-300", 2, context);

    assert.match(hover?.markdown ?? "", /spring, damping 8/);
    assert.equal(hover?.end, 6);
  });

  it("describes keyframe utilities", () => {
    assert.match(
      computeHover("from:opacity-50", 3, context)?.markdown ?? "",
      /Sets `opacity`/,
    );
  });

  it("explains invalid tokens", () => {
    assert.match(
      computeHover("fade-inn", 1, context)?.markdown ?? "",
      /Unknown animate token/,
    );
  });
});

describe("findDefinedPresets", () => {
  it("finds definePreset calls", () => {
    assert.deepEqual(
      findDefinedPresets(`
        definePreset('pop-in', {});
        definePreset("slide-fade", {});
        definePreset(name, {});
      `),
      ["pop-in", "slide-fade"],
    );
  });
});
