import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import { loadBundledMetadata, loadMetadata, parseMetadata } from "../../metadata";

describe("metadata", () => {
  it("bundles valid v1 metadata", () => {
    const metadata = loadBundledMetadata();

    assert.equal(metadata.schemaVersion, 1);
    assert.ok(metadata.presets.some((preset) => preset.name === "fade-in"));
    assert.ok(metadata.countTiming.some((count) => count.prefix === "play-"));
  });

  it("rejects unknown schema versions", () => {
    assert.equal(parseMetadata('{"schemaVersion":2}'), undefined);
    assert.equal(parseMetadata("not json"), undefined);
  });

  it("prefers metadata from the installed library", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "strx-"));
    const pkg = path.join(folder, "node_modules", "react-native-strx");
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "react-native-strx",
        exports: { "./tokens.json": "./tokens.json" },
      }),
    );
    fs.writeFileSync(
      path.join(pkg, "tokens.json"),
      JSON.stringify({ ...loadBundledMetadata(), library: "9.9.9" }),
    );

    const loaded = loadMetadata(folder);

    assert.equal(loaded.source, "project");
    assert.equal(loaded.metadata.library, "9.9.9");
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it("falls back to the bundled snapshot", () => {
    const loaded = loadMetadata(os.tmpdir());

    assert.equal(loaded.source, "bundled");
  });
});
