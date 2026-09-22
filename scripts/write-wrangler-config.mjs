// Ensures wrangler.json exists in Nitro's build output after the build.
// Nitro normally writes it, but on some CI environments (e.g. Cloudflare Pages
// using npm install without our lockfile) the cloudflare preset doesn't run,
// so we generate it from the root wrangler.json as a fallback.
//
// We write it to both dist/server/ and .output/server/, because some deploy
// environments (e.g. Lovable's Cloudflare integration) run a deploy command
// hardcoded to read from dist/server/wrangler.json instead of Nitro's real
// .output/ location.
import { access, cp, mkdir, writeFile, readFile } from "node:fs/promises";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureWranglerConfig({ serverDir, assetsDirectory }) {
  const target = `${serverDir}/wrangler.json`;

  if (!(await exists(`${serverDir}/index.mjs`))) {
    console.error(
      `Build did not produce ${serverDir}/index.mjs - Nitro server build failed.`,
    );
    process.exit(1);
  }

  if (!(await exists(target))) {
    const root = JSON.parse(await readFile("wrangler.json", "utf8"));
    const out = {
      ...root,
      main: "index.mjs",
      assets: { ...(root.assets ?? {}), directory: assetsDirectory },
    };
    await mkdir(serverDir, { recursive: true });
    await writeFile(target, JSON.stringify(out, null, 2));
    console.log(
      `Generated ${target} from root wrangler.json (Nitro fallback).`,
    );
  } else {
    console.log(`${target} already present.`);
  }
}

await ensureWranglerConfig({
  serverDir: ".output/server",
  assetsDirectory: "../public",
});

// Mirror the full build to dist/ too, so both paths resolve to a valid build
// regardless of which one the deploy step reads.
await cp(".output", "dist", { recursive: true });
console.log(
  "Mirrored .output -> dist for deploy tooling that expects the dist/ path.",
);

await ensureWranglerConfig({
  serverDir: "dist/server",
  assetsDirectory: "../public",
});
