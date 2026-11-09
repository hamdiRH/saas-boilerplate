// scripts/pin-versions.mjs
// Rewrites "^x.y.z" ranges in package.json to the exact installed versions.
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

for (const field of ["dependencies", "devDependencies"]) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    const installed = JSON.parse(
      readFileSync(`node_modules/${name}/package.json`, "utf8"),
    ).version;
    pkg[field][name] = installed;
  }
}

writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("✅ Dependencies pinned to exact installed versions.");
