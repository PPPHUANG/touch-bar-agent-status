#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const DEFAULT_STATE_DIR = path.join(SCRIPT_DIR, ".state");
const DEFAULT_STATE_FILE = path.join(DEFAULT_STATE_DIR, "codex-touchbar-status.json");
const STATE_FILE = process.env.CODEX_TOUCHBAR_STATE_FILE || DEFAULT_STATE_FILE;

const argv = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const current = process.argv[i];
  if (current.startsWith("--")) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      argv.set(current, next);
      i += 1;
    } else {
      argv.set(current, "true");
    }
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function readExistingState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeState(state) {
  const dir = path.dirname(STATE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.codex-touchbar-status.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`,
  );
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, STATE_FILE);
}

function shortFileName(filePath) {
  const rawName = path.basename(String(filePath || "").trim()) || "文件";
  const withoutLocalPrefix = rawName.replace(/^codex-touchbar-/, "");
  if (withoutLocalPrefix.length <= 18) return withoutLocalPrefix;
  const extension = path.extname(withoutLocalPrefix);
  const stem = withoutLocalPrefix.slice(0, withoutLocalPrefix.length - extension.length);
  return `${stem.slice(0, 8)}...${extension || stem.slice(-4)}`;
}

function parsePatchStats(command) {
  const text = String(command || "");
  if (!text.includes("*** Begin Patch")) return null;

  const files = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const fileMatch = line.match(/^\*\*\* (Add|Delete|Update) File: (.+)$/);
    if (fileMatch) {
      current = {
        action: fileMatch[1].toLowerCase(),
        path: fileMatch[2].trim(),
        added: 0,
        removed: 0,
      };
      files.push(current);
      continue;
    }

    const moveMatch = line.match(/^\*\*\* Move to: (.+)$/);
    if (moveMatch && current) {
      current.action = "move";
      current.moveTo = moveMatch[1].trim();
      continue;
    }

    if (!current) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.added += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      current.removed += 1;
    }
  }

  if (files.length === 0) return null;

  const added = files.reduce((sum, file) => sum + file.added, 0);
  const removed = files.reduce((sum, file) => sum + file.removed, 0);
  const primary = files[0];
  const action =
    files.length > 1
      ? "multi"
      : primary.action === "add"
        ? "create"
        : primary.action === "delete"
          ? "delete"
          : primary.action === "move"
            ? "move"
            : "update";
  const primaryPath = primary.moveTo || primary.path;
  const primaryName = shortFileName(primaryPath);
  const textLabel =
    files.length > 1
      ? `${files.length}文件 +${added} -${removed}`
      : `${primaryName} +${added} -${removed}`;

  return {
    action,
    primaryPath,
    primaryName,
    fileCount: files.length,
    added,
    removed,
    text: textLabel,
    files,
  };
}

function classifyTool(toolName, toolInput) {
  const raw = String(toolName || "");
  const lowered = raw.toLowerCase();
  const command = String(toolInput?.command || "").toLowerCase();

  if (/multi|subagent|collab/.test(lowered)) {
    return { phase: "delegate", label: "喊同事", symbol: "person.2" };
  }
  if (raw === "Bash" || /shell|exec|terminal/.test(lowered)) {
    return { phase: "command", label: "跑个命令", symbol: "terminal" };
  }
  if (/apply_patch|edit|write|patch/.test(lowered) || /apply_patch/.test(command)) {
    const fileChange = parsePatchStats(toolInput?.command);
    return {
      phase: fileChange ? "file_change" : "edit",
      label: fileChange?.text || "改两笔",
      symbol: "pencil",
      fileChange,
    };
  }
  if (/mcp|browser|chrome|web|search/.test(lowered)) {
    return { phase: "inspect", label: "去看一眼", symbol: "eye" };
  }

  return { phase: "tool", label: "忙一下", symbol: "wrench.and.screwdriver" };
}

function statusForEvent(input, existing, now) {
  const event = input.hook_event_name || argv.get("--event") || "Unknown";
  const toolName = input.tool_name || argv.get("--tool-name") || null;
  const source = input.source || argv.get("--source") || null;
  const existingStartedAt =
    typeof existing?.startedAt === "number" && Number.isFinite(existing.startedAt)
      ? existing.startedAt
      : now;

  const base = {
    version: 1,
    event,
    sessionId: input.session_id || existing?.sessionId || null,
    turnId: input.turn_id || existing?.turnId || null,
    cwd: input.cwd || existing?.cwd || process.cwd(),
    model: input.model || existing?.model || null,
    toolName,
    source,
    permissionMode: input.permission_mode || existing?.permissionMode || null,
    startedAt: existingStartedAt,
    updatedAt: now,
    completedAt: existing?.completedAt || null,
    lastMessage: existing?.lastMessage || "待命中",
    lastError: null,
    symbol: existing?.symbol || "brain.head.profile",
    fileChange: existing?.fileChange || null,
  };

  if (
    event === "SessionStart" &&
    existing?.event === "UserPromptSubmit" &&
    now - Number(existing.updatedAt || 0) < 5000
  ) {
    return {
      ...existing,
      sessionId: base.sessionId,
      cwd: base.cwd,
      model: base.model,
      source,
      sessionStartedAt: now,
    };
  }

  switch (event) {
    case "SessionStart": {
      const label = source === "resume" ? "接上回合" : "开工了";
      return {
        ...base,
        status: "RUN",
        phase: "start",
        startedAt: now,
        lastMessage: label,
        symbol: "play.circle",
      };
    }
    case "UserPromptSubmit":
      return {
        ...base,
        status: "RUN",
        phase: "thinking",
        startedAt: now,
        lastMessage: "我想想",
        symbol: "brain.head.profile",
      };
    case "PreToolUse": {
      const tool = classifyTool(toolName, input.tool_input);
      return {
        ...base,
        status: "TOOL",
        phase: tool.phase,
        startedAt: existingStartedAt,
        toolName,
        toolStartedAt: now,
        lastMessage: tool.label,
        symbol: tool.symbol,
        fileChange: tool.fileChange || null,
      };
    }
    case "PostToolUse": {
      const tool = classifyTool(toolName, input.tool_input);
      const fileChange = tool.fileChange || existing?.fileChange || null;
      return {
        ...base,
        status: "RUN",
        phase: fileChange ? "file_done" : "tool_done",
        startedAt: existingStartedAt,
        toolName,
        lastToolPhase: tool.phase,
        lastMessage: fileChange?.text || "刚做完",
        symbol: "checkmark.circle",
        fileChange,
      };
    }
    case "PermissionRequest":
      return {
        ...base,
        status: "WAIT",
        phase: "permission",
        startedAt: existingStartedAt,
        toolName,
        lastMessage: "等你点头",
        symbol: "hand.raised",
      };
    case "PreCompact":
    case "PostCompact":
      return {
        ...base,
        status: "RUN",
        phase: "compact",
        startedAt: existingStartedAt,
        lastMessage: "整理脑内便签",
        symbol: "note.text",
      };
    case "Stop":
      return {
        ...base,
        status: "OK",
        phase: "done",
        startedAt: existingStartedAt,
        completedAt: now,
        lastMessage: "收工啦",
        symbol: "checkmark.circle",
      };
    default:
      return {
        ...base,
        status: "RUN",
        phase: "activity",
        startedAt: existingStartedAt,
        lastMessage: "忙一下",
        symbol: "sparkles",
      };
  }
}

async function main() {
  const now = Date.now();
  let input = {};

  try {
    const stdin = await readStdin();
    if (stdin.trim()) {
      input = JSON.parse(stdin);
    }
  } catch (error) {
    writeState({
      version: 1,
      event: "HookParseError",
      status: "ERR",
      phase: "error",
      sessionId: null,
      turnId: null,
      cwd: process.cwd(),
      model: null,
      toolName: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      lastMessage: "有点卡住",
      lastError: error instanceof Error ? error.message : String(error),
      symbol: "exclamationmark.triangle",
      host: os.hostname(),
    });
    return;
  }

  const existing = readExistingState();
  const state = statusForEvent(input, existing, now);
  writeState({
    ...state,
    host: os.hostname(),
  });

  if (argv.has("--debug")) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  }
}

main().catch((error) => {
  const now = Date.now();
  writeState({
    version: 1,
    event: "HookRuntimeError",
    status: "ERR",
    phase: "error",
    sessionId: null,
    turnId: null,
    cwd: process.cwd(),
    model: null,
    toolName: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    lastMessage: "有点卡住",
    lastError: error instanceof Error ? error.stack || error.message : String(error),
    symbol: "exclamationmark.triangle",
    host: os.hostname(),
  });
  process.exitCode = 0;
});
