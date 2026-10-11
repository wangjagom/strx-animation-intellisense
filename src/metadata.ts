import * as fs from "fs";
import * as path from "path";

/**
 * Token metadata published by react-native-strx as `react-native-strx/tokens.json`.
 * A snapshot is bundled in `data/tokens.json` for projects whose installed
 * library does not ship it yet.
 */
export interface TokenMetadata {
  schemaVersion: 1;
  library: string;
  presets: {
    name: string;
    initial: Record<string, number>;
    target: Record<string, number>;
    motion: string;
  }[];
  easings: { token: string; description: string }[];
  spring: { token: string; description: string };
  numericTiming: { prefix: string; example: string; description: string }[];
  countTiming: {
    prefix: string;
    example: string;
    description: string;
    legacy: boolean;
  }[];
  keyframePrefixes: { prefix: string; description: string }[];
  utilities: {
    prefix: string;
    property: string;
    signed: boolean;
    example: string;
    result: string;
    max?: number;
  }[];
  transitions: { token: string; kind: string; description: string }[];
  layout: { token: string; description: string; motion: string }[];
}

export interface LoadedMetadata {
  metadata: TokenMetadata;
  /** Where the metadata came from, shown in hovers for transparency. */
  source: "project" | "bundled";
}

const BUNDLED_PATH = path.join(__dirname, "..", "data", "tokens.json");

export function parseMetadata(json: string): TokenMetadata | undefined {
  try {
    const value = JSON.parse(json) as Partial<TokenMetadata>;

    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.presets) ||
      !Array.isArray(value.utilities)
    ) {
      return undefined;
    }

    return value as TokenMetadata;
  } catch {
    return undefined;
  }
}

export function loadBundledMetadata(): TokenMetadata {
  const metadata = parseMetadata(fs.readFileSync(BUNDLED_PATH, "utf8"));

  if (!metadata) {
    throw new Error("Bundled STRX token metadata is invalid.");
  }

  return metadata;
}

/**
 * Loads token metadata from the `react-native-strx` package installed in
 * `folder`, falling back to the bundled snapshot.
 */
export function loadMetadata(folder: string | undefined): LoadedMetadata {
  if (folder) {
    try {
      const file = require.resolve("react-native-strx/tokens.json", {
        paths: [folder],
      });
      const metadata = parseMetadata(fs.readFileSync(file, "utf8"));

      if (metadata) {
        return { metadata, source: "project" };
      }
    } catch {
      // Not installed, or an older version without tokens.json.
    }
  }

  return { metadata: loadBundledMetadata(), source: "bundled" };
}
