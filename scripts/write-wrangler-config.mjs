// Nitro already generates dist/server/wrangler.json correctly during build.
// This script is a no-op safety net that just verifies the file exists.
import { access } from "node:fs/promises";

await access("dist/server/wrangler.json");
await access("dist/server/index.mjs");
console.log("Verified dist/server/{wrangler.json,index.mjs} exist");
