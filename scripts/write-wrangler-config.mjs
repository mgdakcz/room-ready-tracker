import { mkdir, readFile, writeFile } from "node:fs/promises";

const rootConfig = JSON.parse(await readFile("wrangler.json", "utf8"));

const serverConfig = {
  ...rootConfig,
  main: "index.mjs",
  assets: {
    ...rootConfig.assets,
    directory: "../client",
  },
};

await mkdir("dist/server", { recursive: true });
await writeFile(
  "dist/server/wrangler.json",
  `${JSON.stringify(serverConfig, null, 2)}\n`,
);