import type { GrammarContext } from "../../grammar";
import { loadBundledMetadata } from "../../metadata";

export function makeContext(customPresets: string[] = []): GrammarContext {
  return {
    metadata: loadBundledMetadata(),
    customPresets: new Set(customPresets),
  };
}
