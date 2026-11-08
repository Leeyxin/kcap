import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const pkg = readJson("../package.json");
const lock = readJson("../package-lock.json");
const config = readJson("../src-tauri/tauri.conf.json");
const metadata = spawnSync(
  "cargo",
  ["metadata", "--no-deps", "--format-version", "1", "--locked", "--manifest-path", "src-tauri/Cargo.toml"],
  { cwd: root, encoding: "utf8" }
);

if (metadata.error || metadata.status !== 0) {
  throw new Error(metadata.error?.message || metadata.stderr || "Unable to read Cargo metadata.");
}

const rustPackage = JSON.parse(metadata.stdout).packages.find((entry) => entry.name === "kcap");
const versions = {
  "package.json": pkg.version,
  "package-lock.json": lock.version,
  "package-lock.json root package": lock.packages[""].version,
  "tauri.conf.json": config.version,
  "Cargo.toml": rustPackage?.version
};
const version = config.version;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid release version: ${version}`);
}

for (const [path, value] of Object.entries(versions)) {
  if (value !== version) {
    throw new Error(`${path} has version ${value}; expected ${version}. Update all version files before releasing.`);
  }
}

const tag = `v${version}`;
if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== tag) {
  throw new Error(`Tag ${process.env.GITHUB_REF_NAME} does not match app version ${tag}.`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${tag}\nprerelease=${version.includes("-")}\n`);
}

console.log(`Release version verified: ${tag}`);
