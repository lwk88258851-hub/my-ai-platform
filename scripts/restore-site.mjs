import { cp, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const archiveRoot = path.join(root, "site-archive");
const siteDir = path.join(root, "site");

const arg = process.argv.slice(2).find(Boolean) || "";
if (!arg) {
  process.stderr.write("Usage: node scripts/restore-site.mjs <archive-folder-name>\n");
  process.exit(1);
}

const source = path.join(archiveRoot, arg);
await rm(siteDir, { recursive: true, force: true });
await cp(source, siteDir, { recursive: true });

