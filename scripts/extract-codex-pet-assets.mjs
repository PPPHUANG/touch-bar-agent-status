#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_DIR = path.dirname(SCRIPT_DIR);
const ASAR_PATH = "/Applications/Codex.app/Contents/Resources/app.asar";
const OUT_DIR = path.join(PROJECT_DIR, "assets", "pet");

const TARGETS = [
  "webview/assets/codex-spritesheet-v4-Bl6P89d_.webp",
  "webview/assets/dewey-spritesheet-v4-gAYk_M9g.webp",
  "webview/assets/rocky-spritesheet-v4-3RlTi26B.webp",
  "webview/assets/seedy-spritesheet-v4-CdlE_fn9.webp",
  "webview/assets/stacky-spritesheet-v4-CaUJd4fY.webp",
];

function readAsarHeader(buffer) {
  const headerStringSize = buffer.readUInt32LE(12);
  const headerString = buffer.subarray(16, 16 + headerStringSize).toString("utf8");
  const dataStart = 16 + Math.ceil(headerStringSize / 4) * 4;
  return {
    header: JSON.parse(headerString),
    dataStart,
  };
}

function findFile(header, filePath) {
  return filePath.split("/").reduce((node, part) => node?.files?.[part], header);
}

function petName(filePath) {
  return path.basename(filePath).replace(/-spritesheet-v4-.+\.webp$/, "");
}

const buffer = fs.readFileSync(ASAR_PATH);
const { header, dataStart } = readAsarHeader(buffer);

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const target of TARGETS) {
  const file = findFile(header, target);
  if (!file || file.unpacked) continue;

  const start = dataStart + Number(file.offset);
  const end = start + Number(file.size);
  const outputPath = path.join(OUT_DIR, `${petName(target)}-spritesheet.webp`);
  fs.writeFileSync(outputPath, buffer.subarray(start, end));
  console.log(outputPath);
}
