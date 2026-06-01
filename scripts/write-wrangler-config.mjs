// Nitro generates dist/server/wrangler.json with `main: "index.mjs"` and
// `assets.directory: "../client"` — paths relative to the config file.
// Some wrangler/CI environments resolve these paths relative to cwd (project
// root) instead, causing "entry-point file at 'index.mjs' was not found".
// Rewrite them as project-root-relative paths so both behaviors work.
import { readFile, writeFile } from "node:fs/promises";

const path = "dist/server/wrangler.json";
const config = JSON.parse(await readFile(path, "utf8"));

config.main = "dist/server/index.mjs";
if (config.assets) {
  config.assets.directory = "dist/client";
}

await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
console.log("Patched dist/server/wrangler.json paths to project-root-relative");
