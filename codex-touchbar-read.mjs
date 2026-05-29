#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const DEFAULT_STATE_FILE = path.join(SCRIPT_DIR, ".state", "codex-touchbar-status.json");
const STATE_FILE = process.env.CODEX_TOUCHBAR_STATE_FILE || DEFAULT_STATE_FILE;
const CODEX_ICON_PATH = "/Applications/Codex.app/Contents/Resources/codexTemplate@2x.png";
const PET_FRAME_DIR = path.join(SCRIPT_DIR, "assets", "pet", "frames");
const ICON_DIR = path.join(SCRIPT_DIR, "assets", "icons");
const TRANSPARENT = "0,0,0,0";
const TRANSPARENT_ICON_DATA =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const OK_TTL_MS = 20_000;
const TOOL_DONE_TTL_MS = 3_000;
const FILE_DONE_TTL_MS = 8_000;
const START_TTL_MS = 4_000;
const COMPACT_TTL_MS = 5_000;
const RUN_STALE_MS = 30 * 60_000;
const WAIT_STALE_MS = numberEnv("CODEX_TOUCHBAR_WAIT_STALE_MS", 90_000);
const ELAPSED_AFTER_MS = 10_000;

const ARGS = parseArgs(process.argv.slice(2));
const SLOT = ARGS.get("--slot");

const COLORS = {
  thinking: "30,64,175,255",
  tool: "154,52,18,255",
  wait: "91,33,182,255",
  ok: "22,101,52,255",
  idle: "17,94,89,255",
  error: "153,27,27,255",
  subSlot: "24,24,27,235",
  subSlotSoft: "39,39,42,235",
  text: "255,255,255,255",
  mutedText: "212,212,216,255",
  diffText: "134,239,172,255",
  removeText: "252,165,165,255",
  fileText: "153,246,228,255",
};

const IDLE_FRAMES = [
  { text: "摸鱼中", color: "17,94,89,255" },
  { text: "摸鱼中.", color: "15,118,110,255" },
  { text: "摸鱼中..", color: "20,83,79,255" },
  { text: "摸鱼中...", color: "12,104,96,255" },
];

const PET_FRAMES = {
  idleWalk: [
    "codex-pet-tool-0.png",
    "codex-pet-tool-1.png",
    "codex-pet-tool-2.png",
    "codex-pet-tool-3.png",
    "codex-pet-tool-4.png",
    "codex-pet-tool-5.png",
  ],
  thinking: [
    "codex-pet-thinking-0.png",
    "codex-pet-thinking-1.png",
    "codex-pet-thinking-2.png",
    "codex-pet-thinking-3.png",
  ],
  tool: [
    "codex-pet-tool-0.png",
    "codex-pet-tool-1.png",
    "codex-pet-tool-2.png",
    "codex-pet-tool-3.png",
    "codex-pet-tool-4.png",
    "codex-pet-tool-5.png",
  ],
  wait: ["codex-pet-wait-0.png", "codex-pet-wait-1.png"],
  ok: ["codex-pet-ok-0.png", "codex-pet-ok-1.png", "codex-pet-ok-2.png"],
  error: ["codex-pet-error-0.png", "codex-pet-error-1.png"],
};

const SYMBOLS = {
  thinking: "brain.head.profile",
  command: "terminal",
  edit: "pencil",
  wait: "hand.raised",
  ok: "checkmark.circle",
  idle: "circle",
  error: "exclamationmark.triangle",
  inspect: "eye",
  delegate: "person.2",
  compact: "note.text",
  file_change: "pencil",
  file_done: "checkmark.circle",
};

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    return {
      status: "ERR",
      phase: "error",
      updatedAt: Date.now(),
      startedAt: Date.now(),
      lastMessage: "有点卡住",
      lastError: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseArgs(args) {
  const parsed = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;

    const equalsAt = arg.indexOf("=");
    if (equalsAt > -1) {
      parsed.set(arg.slice(0, equalsAt), arg.slice(equalsAt + 1));
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      parsed.set(arg, next);
      index += 1;
      continue;
    }

    parsed.set(arg, "true");
  }
  return parsed;
}

function intArg(name, fallback) {
  const value = Number.parseInt(ARGS.get(name), 10);
  return Number.isFinite(value) ? value : fallback;
}

function numberEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function dots(now) {
  return ".".repeat((Math.floor(now / 700) % 3) + 1);
}

function idleFrame(now) {
  return IDLE_FRAMES[Math.floor(now / 1_000) % IDLE_FRAMES.length];
}

function renderIdle(now) {
  const frame = idleFrame(now);
  return {
    text: frame.text,
    backgroundColor: frame.color,
    fontColor: COLORS.text,
    sfSymbol: SYMBOLS.idle,
    status: "IDLE",
  };
}

function renderEmptySlot(status = "IDLE") {
  return {
    text: " ",
    backgroundColor: TRANSPARENT,
    fontColor: "255,255,255,0",
    status,
    fontSize: 1,
    iconData: TRANSPARENT_ICON_DATA,
  };
}

function statusAccentColor(status) {
  switch (status) {
    case "ERR":
      return "252,165,165,255";
    case "WAIT":
      return "216,180,254,255";
    case "OK":
      return COLORS.diffText;
    case "TOOL":
      return "253,186,116,255";
    case "RUN":
      return "147,197,253,255";
    default:
      return COLORS.mutedText;
  }
}

function walkPosition(now, count) {
  const safeCount = Math.max(1, count);
  if (safeCount === 1) return 0;

  const span = safeCount * 2 - 2;
  const step = Math.floor(now / 700) % span;
  return step < safeCount ? step : span - step;
}

function petFrameKey(rendered) {
  if (rendered.status === "ERR") return "error";
  if (rendered.status === "WAIT") return "wait";
  if (rendered.status === "OK") return "ok";
  if (rendered.status === "TOOL") return "tool";
  if (rendered.status === "RUN") return "thinking";
  return "idleWalk";
}

function petIconPath(rendered, now) {
  const frames = PET_FRAMES[petFrameKey(rendered)] || PET_FRAMES.idleWalk;
  const frame = frames[Math.floor(now / 700) % frames.length];
  const framePath = path.join(PET_FRAME_DIR, frame);
  return fs.existsSync(framePath) ? framePath : CODEX_ICON_PATH;
}

function assetIconPath(name) {
  const iconPath = path.join(ICON_DIR, `${name}.png`);
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function slotIconPayload(name) {
  const iconPath = name ? assetIconPath(name) : undefined;
  return iconPath ? { iconPath } : { iconData: TRANSPARENT_ICON_DATA };
}

function toolSlotIconName(state) {
  const phase = String(state?.phase || "");
  const lastToolPhase = String(state?.lastToolPhase || "");
  const toolName = String(state?.toolName || "").toLowerCase();
  const symbol = String(state?.symbol || "");
  if (
    phase === "command" ||
    lastToolPhase === "command" ||
    symbol === "terminal" ||
    toolName === "bash" ||
    /shell|exec|terminal/.test(toolName)
  ) {
    return "terminal";
  }
  return null;
}

function withElapsed(text, state, now) {
  const startedAt = Number(state.startedAt || state.updatedAt || now);
  const elapsed = now - startedAt;
  if (elapsed < ELAPSED_AFTER_MS) return text;
  return `${text} ${formatElapsed(elapsed)}`;
}

function stripElapsed(text) {
  return String(text || "").replace(/ \d{2}:\d{2}$/, "");
}

function workspaceName(state) {
  return path.basename(state?.cwd || process.cwd()) || "workspace";
}

function toolSlotLabel(state, rendered) {
  if (rendered.status === "IDLE") return "idle";
  if (rendered.status === "WAIT") return "审批";
  if (rendered.status === "ERR") return "error";
  if (rendered.status === "OK") return "done";

  const phase = state?.phase || rendered.status;
  const toolName = String(state?.toolName || "");
  if (phase === "command") return toolName || "Bash";
  if (phase === "file_change" || phase === "file_done" || phase === "edit") return "Patch";
  if (phase === "inspect") return "Browser";
  if (phase === "delegate") return "Agents";
  if (phase === "compact") return "Compact";
  if (phase === "thinking") return "Think";
  if (phase === "tool_done") return state?.lastToolPhase || "Done";
  if (phase === "start") return "Start";
  return toolName || "Work";
}

function elapsedSlotText(state, rendered, now) {
  if (rendered.status === "ERR") return "卡住";

  const startedAt = Number(state.startedAt || state.updatedAt || now);
  const endedAt =
    rendered.status === "OK" && Number.isFinite(Number(state.completedAt))
      ? Number(state.completedAt)
      : now;
  return formatElapsed(endedAt - startedAt);
}

function diffSlotText(state) {
  const change = state?.fileChange;
  return `+${Number(change.added || 0)} -${Number(change.removed || 0)}`;
}

function diffAddSlotText(state) {
  const change = state?.fileChange;
  return `+${Number(change?.added || 0)}`;
}

function diffRemoveSlotText(state) {
  const change = state?.fileChange;
  return `-${Number(change?.removed || 0)}`;
}

function fileSlotText(state) {
  const change = state?.fileChange;
  if (!change) return workspaceName(state);
  if (Number(change.fileCount || 0) > 1) return `${change.fileCount}文件`;
  return change.primaryName || workspaceName(state);
}

function renderSlot(slot, state, rendered, now) {
  switch (slot) {
    case "walk": {
      const count = Math.max(1, intArg("--count", 6));
      const index = Math.max(0, intArg("--index", 0));
      if (rendered.status !== "IDLE" || index !== walkPosition(now, count)) {
        return renderEmptySlot(rendered.status);
      }
      return {
        text: " ",
        backgroundColor: TRANSPARENT,
        fontColor: "255,255,255,0",
        status: rendered.status,
        fontSize: 1,
        iconPath: petIconPath(rendered, now),
      };
    }
    case "pet":
      return {
        text: " ",
        backgroundColor: TRANSPARENT,
        fontColor: "255,255,255,0",
        status: rendered.status,
        fontSize: 1,
        iconPath: petIconPath(rendered, now),
      };
    case "main":
      return {
        ...rendered,
        text: stripElapsed(rendered.text),
        iconPath: petIconPath(rendered, now),
      };
    case "timer":
      if (!state || rendered.status === "IDLE") return renderEmptySlot(rendered.status);
      return {
        text: elapsedSlotText(state, rendered, now),
        backgroundColor: COLORS.subSlot,
        fontColor: statusAccentColor(rendered.status),
        sfSymbol: "timer",
        status: rendered.status,
        fontSize: 13,
        ...slotIconPayload("timer"),
      };
    case "tool":
      if (rendered.status === "IDLE") {
        return renderEmptySlot(rendered.status);
      }
      return {
        text: toolSlotLabel(state, rendered),
        backgroundColor: COLORS.subSlotSoft,
        fontColor: statusAccentColor(rendered.status),
        sfSymbol: state?.symbol || rendered.sfSymbol,
        status: rendered.status,
        fontSize: 12,
        ...slotIconPayload(toolSlotIconName(state)),
      };
    case "diff": {
      const hasChange = Boolean(state?.fileChange);
      if (!hasChange || rendered.status === "IDLE") {
        return renderEmptySlot(rendered.status);
      }
      return {
        text: diffSlotText(state),
        backgroundColor: COLORS.subSlot,
        fontColor: COLORS.diffText,
        sfSymbol: "plus.forwardslash.minus",
        status: rendered.status,
        fontSize: 13,
      };
    }
    case "diff-add":
    case "diffAdd":
    case "add": {
      const hasChange = Boolean(state?.fileChange);
      if (!hasChange || rendered.status === "IDLE") {
        return renderEmptySlot(rendered.status);
      }
      return {
        text: diffAddSlotText(state),
        backgroundColor: COLORS.subSlot,
        fontColor: COLORS.diffText,
        sfSymbol: "plus",
        status: rendered.status,
        fontSize: 13,
      };
    }
    case "diff-remove":
    case "diffRemove":
    case "remove": {
      const hasChange = Boolean(state?.fileChange);
      if (!hasChange || rendered.status === "IDLE") {
        return renderEmptySlot(rendered.status);
      }
      return {
        text: diffRemoveSlotText(state),
        backgroundColor: COLORS.subSlot,
        fontColor: COLORS.removeText,
        sfSymbol: "minus",
        status: rendered.status,
        fontSize: 13,
      };
    }
    case "file":
      if (!state?.fileChange || rendered.status === "IDLE") {
        return renderEmptySlot(rendered.status);
      }
      return {
        text: fileSlotText(state),
        backgroundColor: COLORS.subSlotSoft,
        fontColor: COLORS.fileText,
        sfSymbol: "doc.text",
        status: rendered.status,
        fontSize: 12,
        ...slotIconPayload("text"),
      };
    default:
      return {
        ...rendered,
        iconPath: petIconPath(rendered, now),
      };
  }
}

function render(state, now = Date.now()) {
  if (!state) {
    return renderIdle(now);
  }

  const updatedAt = Number(state.updatedAt || 0);
  const age = now - updatedAt;

  if (state.status === "ERR") {
    return {
      text: "有点卡住",
      backgroundColor: COLORS.error,
      fontColor: COLORS.text,
      sfSymbol: SYMBOLS.error,
      status: "ERR",
    };
  }

  if (state.status === "OK") {
    if (age <= OK_TTL_MS) {
      return {
        text: "收工啦",
        backgroundColor: COLORS.ok,
        fontColor: COLORS.text,
        sfSymbol: SYMBOLS.ok,
        status: "OK",
      };
    }
    return renderIdle(now);
  }

  if (state.status === "WAIT" && age <= WAIT_STALE_MS) {
    return {
      text: withElapsed("等你点头", state, now),
      backgroundColor: COLORS.wait,
      fontColor: COLORS.text,
      sfSymbol: SYMBOLS.wait,
      status: "WAIT",
    };
  }

  if (state.status === "TOOL" && age <= RUN_STALE_MS) {
    const phase = state.phase || "tool";
    const text = state.fileChange?.text || state.lastMessage || "忙一下";
    return {
      text: state.fileChange ? text : withElapsed(text, state, now),
      backgroundColor: COLORS.tool,
      fontColor: COLORS.text,
      sfSymbol: SYMBOLS[phase] || state.symbol || "wrench.and.screwdriver",
      status: "TOOL",
    };
  }

  if (state.status === "RUN" && age <= RUN_STALE_MS) {
    if (state.phase === "file_done" && state.fileChange && age <= FILE_DONE_TTL_MS) {
      return {
        text: state.fileChange.text,
        backgroundColor: COLORS.ok,
        fontColor: COLORS.text,
        sfSymbol: SYMBOLS.file_done,
        status: "RUN",
      };
    }

    if (state.phase === "tool_done" && age <= TOOL_DONE_TTL_MS) {
      return {
        text: "刚做完",
        backgroundColor: COLORS.ok,
        fontColor: COLORS.text,
        sfSymbol: SYMBOLS.ok,
        status: "RUN",
      };
    }

    if (state.phase === "start" && age <= START_TTL_MS) {
      return {
        text: state.lastMessage || "开工了",
        backgroundColor: COLORS.thinking,
        fontColor: COLORS.text,
        sfSymbol: "play.circle",
        status: "RUN",
      };
    }

    if (state.phase === "compact" && age <= COMPACT_TTL_MS) {
      return {
        text: "整理脑内便签",
        backgroundColor: COLORS.tool,
        fontColor: COLORS.text,
        sfSymbol: SYMBOLS.compact,
        status: "RUN",
      };
    }

    return {
      text: withElapsed(`我想想${dots(now)}`, state, now),
      backgroundColor: COLORS.thinking,
      fontColor: COLORS.text,
      sfSymbol: SYMBOLS.thinking,
      status: "RUN",
    };
  }

  return renderIdle(now);
}

function output(rendered) {
  if (ARGS.has("--text")) {
    process.stdout.write(`${rendered.text}\n`);
    return;
  }

  if (ARGS.has("--meta-json")) {
    process.stdout.write(`${JSON.stringify(rendered, null, 2)}\n`);
    return;
  }

  const payload = {
    text: rendered.text,
    background_color: rendered.backgroundColor,
    font_color: rendered.fontColor,
    font_size: rendered.fontSize || 14,
  };
  if (rendered.iconPath) {
    payload.icon_path = rendered.iconPath;
  }
  if (rendered.iconData) {
    payload.icon_data = rendered.iconData;
  }

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const now = Date.now();
const state = readState();
const rendered = render(state, now);
output(renderSlot(SLOT, state, rendered, now));
