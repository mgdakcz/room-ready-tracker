// Ensures dist/server/wrangler.json exists after the build.
// Nitro normally writes it, but on some CI environments (e.g. Cloudflare Pages
// using npm install without our lockfile) the cloudflare preset doesn't run,
// so we generate it from the root wrangler.json as a fallback.
import { access, mkdir, writeFile, readFile } from "node:fs/promises";

const target = "dist/server/wrangler.json";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
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

// Ensures .output/server/wrangler.json exists after the build.
// Nitro normally writes it, but on some CI environments (e.g. Cloudflare Pages
// using npm install without our lockfile) the cloudflare preset doesn't run,
// so we generate it from the root wrangler.json as a fallback.
import { access, cp, mkdir, writeFile, readFile } from "node:fs/promises";

const target = ".output/server/wrangler.json";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(".output/server/index.mjs"))) {
  console.error("Build did not produce .output/server/index.mjs - Nitro server build failed.");
  process.exit(1);
}

if (!(await exists(target))) {
  const root = JSON.parse(await readFile("wrangler.json", "utf8"));
  const out = {
    ...root,
    main: "index.mjs",
    assets: { ...(root.assets ?? {}), directory: "../public" },
  };
  await mkdir(".output/server", { recursive: true });
  await writeFile(target, JSON.stringify(out, null, 2));
  console.log(`Generated ${target} from root wrangler.json (Nitro fallback).`);
} else {
  console.log(`${target} already present.`);
}

// Some deploy environments (e.g. Lovable's Cloudflare integration) run a
// deploy command hardcoded to read from dist/server/wrangler.json instead of
// Nitro's real .output/ location. Mirror the full build there too, so both
// paths resolve to a valid build regardless of which one the deploy step reads.
await cp(".output", "dist", { recursive: true });
console.log("Mirrored .output -> dist for deploy tooling that expects the dist/ path.");
