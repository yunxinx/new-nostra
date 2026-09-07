#!/usr/bin/env node
// Fails when the version fields drift apart. Release builds read the version
// from three files at once, so a mismatch ships inconsistent metadata.

import { readFileSync } from "node:fs";

const errors = [];

function readCargoVersion(path) {
  const match = readFileSync(path, "utf8").match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    errors.push(`${path}: no [package] version line found`);
    return null;
  }
  return match[1];
}

function readJsonVersion(path, field = "version") {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"))[field];
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`${path}: "${field}" is empty or missing`);
      return null;
    }
    return value;
  } catch {
    errors.push(`${path}: unreadable or not valid JSON`);
    return null;
  }
}

const versions = {
  "package.json": readJsonVersion("package.json"),
  "src-tauri/Cargo.toml": readCargoVersion("src-tauri/Cargo.toml"),
  "src-tauri/tauri.conf.json": readJsonVersion("src-tauri/tauri.conf.json"),
};

const unique = new Set(Object.values(versions));

const refName = process.env.GITHUB_REF_NAME;
if (refName?.startsWith("v")) {
  const tagVersion = refName.slice(1);
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(tagVersion)) {
    errors.push(
      `tag "${refName}": expected v<major>.<minor>.<patch>[-prerelease]`,
    );
  } else {
    for (const [source, version] of Object.entries(versions)) {
      if (version !== null && version !== tagVersion) {
        errors.push(`tag "${refName}" does not match ${source} (${version})`);
      }
    }
  }
}

if (unique.size > 1 && errors.length === 0) {
  for (const [source, version] of Object.entries(versions)) {
    errors.push(`${source}: ${version}`);
  }
  errors.push("version fields disagree; align all of them before releasing");
}

if (errors.length > 0) {
  console.error(`version check failed:\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}

console.log(`version check ok: ${versions["package.json"]}`);
