#!/usr/bin/env node

/**
 * Validates that pnpm resolves workspace:* to real semver ranges
 * before publishing. Run via: corepack pnpm release:validate
 *
 * Exits 1 if any publishable package still has workspace:* in its
 * packed tarball — which means it will fail to install from npm.
 */

import { execSync } from "node:child_process";
import { readFileSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { extract as tarExtract } from "tar";

const ROOT = resolve(import.meta.dirname, "..");
const TMP = join(ROOT, ".release-validate");

const PNPM = "corepack pnpm";

const PUBLISH_ORDER = [
  "@tyrpay/sdk-core",
  "@tyrpay/storage-adapter",
  "@tyrpay/zktls-adapter",
  "@tyrpay/buyer-sdk",
  "@tyrpay/seller-sdk",
  "@tyrpay/buyer-skill",
  "@tyrpay/seller-skill",
  "@tyrpay/agent-kit",
];

function run(cmd, cwd = ROOT) {
  return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function getPackageDir(name) {
  return name.replace("@tyrpay/", "");
}

mkdirSync(TMP, { recursive: true });

let failed = false;

for (const pkg of PUBLISH_ORDER) {
  const dir = getPackageDir(pkg);

  try {
    const pkgJson = JSON.parse(readFileSync(join(ROOT, "packages", dir, "package.json"), "utf-8"));
    if (pkgJson.private) {
      console.log(`SKIP  ${pkg} (private)`);
      continue;
    }
  } catch {
    console.log(`SKIP  ${pkg} (no package.json)`);
    continue;
  }

  console.log(`CHECK ${pkg} ...`);

  try {
    const pkgDir = join(ROOT, "packages", dir);
    const packOutput = run(`${PNPM} pack --pack-destination "${TMP}"`, pkgDir);
    const tarballLine = packOutput.split("\n").pop().trim();
    // pack may return a full path or just a filename
    const tarballPath = tarballLine.includes("/") || tarballLine.includes("\\")
      ? tarballLine
      : join(TMP, tarballLine);

    if (!tarballLine.endsWith(".tgz")) {
      console.log(`  FAIL unexpected pack output: ${packOutput}`);
      failed = true;
      continue;
    }

    const extractDir = join(TMP, dir);
    mkdirSync(extractDir, { recursive: true });

    await tarExtract({ file: tarballPath, cwd: extractDir });

    const packedPkg = JSON.parse(
      readFileSync(join(extractDir, "package", "package.json"), "utf-8")
    );

    const depFields = ["dependencies", "peerDependencies", "optionalDependencies"];
    const workspaceRefs = [];

    for (const field of depFields) {
      const deps = packedPkg[field];
      if (!deps) continue;
      for (const [name, version] of Object.entries(deps)) {
        if (String(version).startsWith("workspace:")) {
          workspaceRefs.push(`  ${field}.${name}: "${version}"`);
        }
      }
    }

    if (workspaceRefs.length > 0) {
      console.log(`  FAIL unresolved workspace:* found in packed tarball:`);
      for (const ref of workspaceRefs) {
        console.log(`    ${ref}`);
      }
      failed = true;
    } else {
      console.log(`  OK   ${pkg}@${packedPkg.version}`);
    }
  } catch (err) {
    console.log(`  FAIL ${err.message}`);
    failed = true;
  }
}

rmSync(TMP, { recursive: true, force: true });

if (failed) {
  console.log("\n---\nFAILED: One or more packages have unresolved workspace:* references.");
  console.log("Make sure you use 'pnpm publish' (not 'npm publish') to resolve workspace protocols.\n");
  process.exit(1);
} else {
  console.log("\n---\nAll packages validated. Safe to publish.\n");
}
