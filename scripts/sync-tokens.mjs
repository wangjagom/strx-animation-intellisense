// Copies react-native-strx's tokens.json into data/tokens.json, the snapshot
// used when a project's installed library does not ship token metadata.
//
//   npm run sync:tokens                      # from node_modules/react-native-strx
//   npm run sync:tokens -- ../react-native-strx/tokens.json
import { copyFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source =
  process.argv[2] ??
  createRequire(join(root, "package.json")).resolve(
    "react-native-strx/tokens.json",
  );
const metadata = JSON.parse(readFileSync(source, "utf8"));

if (metadata.schemaVersion !== 1) {
  throw new Error(`Unsupported schemaVersion ${metadata.schemaVersion} in ${source}`);
}

copyFileSync(source, join(root, "data", "tokens.json"));
console.log(`Synced tokens.json from react-native-strx ${metadata.library}`);
