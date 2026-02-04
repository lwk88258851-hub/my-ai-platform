import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const siteDir = path.join(root, "site");
const archiveRoot = path.join(root, "site-archive");

const pad2 = (n) => String(n).padStart(2, "0");
const now = new Date();
const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

let sha = "unknown";
try {
  sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || sha;
} catch {
  sha = "unknown";
}

const target = path.join(archiveRoot, `${stamp}-${sha}`);
await mkdir(target, { recursive: true });
await cp(siteDir, target, { recursive: true });
process.stdout.write(target + "\n");

