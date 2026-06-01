// Ensures dist/server/wrangler.json exists after the build.
// Nitro normally writes it, but on some CI environments (e.g. Cloudflare Pages
// using npm install without our lockfile) the cloudflare preset doesn't run,
// so we generate it from the root wrangler.json as a fallback.
import { access, mkdir, writeFile, readFile } from "node:fs/promises";

const target = "dist/server/wrangler.json";

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

if (!(await exists("dist/server/index.mjs"))) {
  console.error("Build did not produce dist/server/index.mjs - Nitro server build failed.");
  process.exit(1);
}

if (!(await exists(target))) {
  const root = JSON.parse(await readFile("wrangler.json", "utf8"));
  const out = {
    ...root,
    main: "index.mjs",
    assets: { ...(root.assets ?? {}), directory: "../client" },
  };
  await mkdir("dist/server", { recursive: true });
  await writeFile(target, JSON.stringify(out, null, 2));
  console.log(`Generated ${target} from root wrangler.json (Nitro fallback).`);
} else {
  console.log(`${target} already present.`);
}
