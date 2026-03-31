import fs from "node:fs";
import path from "node:path";
import type { AstroIntegration } from "astro";

export function copyDataIntegration(): AstroIntegration {
  return {
    name: "copy-data",
    hooks: {
      "astro:build:start": () => {
        const dataDir = path.resolve(process.cwd(), "data");
        const publicDataDir = path.resolve(process.cwd(), "public", "data");

        if (!fs.existsSync(dataDir)) return;

        fs.mkdirSync(publicDataDir, { recursive: true });

        const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json") && f !== "checkpoint.json");
        for (const file of files) {
          fs.copyFileSync(path.join(dataDir, file), path.join(publicDataDir, file));
        }
        console.log(`[copy-data] Copied ${files.length} JSON files to public/data/`);
      },
    },
  };
}
