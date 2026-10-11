import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findAnimateSegments,
  segmentAt,
  type SourceLanguage,
} from "../../documentScanner";

function values(source: string, language: SourceLanguage = "typescriptreact") {
  return findAnimateSegments(source, language)?.map((segment) => [
    segment.kind,
    segment.value,
  ]);
}

describe("findAnimateSegments", () => {
  it("finds JSX attribute strings", () => {
    assert.deepEqual(values(`<Strx.View animate="fade-in" style={s} />`), [
      ["tokens", "fade-in"],
    ]);
  });

  it("finds strings inside expressions", () => {
    assert.deepEqual(
      values(
        `<Strx.View animate={open ? ["fade-in", 'slide-up'] : enabled && \`scale-in\`} />`,
      ),
      [
        ["tokens", "fade-in"],
        ["tokens", "slide-up"],
        ["tokens", "scale-in"],
      ],
    );
  });

  it("finds animate properties such as useTimeline playables", () => {
    assert.deepEqual(
      values(`
        const timeline = Strx.useTimeline({
          playables: [
            { target: "card", animate: "from:opacity-0 to:opacity-100" },
          ],
        });
      `),
      [["tokens", "from:opacity-0 to:opacity-100"]],
    );
  });

  it("reads preset names from animation objects", () => {
    assert.deepEqual(
      values(`<Strx.View animate={{ type: "bounce", damping: 8 }} />`),
      [["presetName", "bounce"]],
    );
  });

  it("splits template literals around expressions", () => {
    const segments = findAnimateSegments(
      "<Strx.View animate={`fade-in delay-${delay} ease-in`} />",
      "typescriptreact",
    );

    assert.deepEqual(
      segments?.map((segment) => [
        segment.value,
        segment.openStart,
        segment.openEnd,
      ]),
      [
        ["fade-in delay-", false, true],
        [" ease-in", true, false],
      ],
    );
  });

  it("ignores other attributes and strings", () => {
    assert.deepEqual(
      values(`<Text title="fade-in">Don't animate="nope"</Text>`),
      [],
    );
  });

  it("locates the segment under the cursor", () => {
    const source = `<Strx.View animate="fade-in" />`;
    const segments = findAnimateSegments(source, "typescriptreact") ?? [];
    const offset = source.indexOf("in\"");

    assert.equal(segmentAt(segments, offset)?.value, "fade-in");
    assert.equal(segmentAt(segments, 0), undefined);
  });

  it("parses plain TypeScript with type assertions", () => {
    assert.deepEqual(
      values(`const p = { animate: <string>"fade-in" as string };`, "typescript"),
      [["tokens", "fade-in"]],
    );
  });
});
