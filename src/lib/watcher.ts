import path from "node:path";
import os from "node:os";
import { watch, type FSWatcher } from "chokidar";
import { scanAll } from "./scanner";
import { readRegistry, writeRegistry } from "./registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ChangeEvent = {
  type: string;
  path: string;
  timestamp: string;
};

type ChangeListener = (event: ChangeEvent) => void;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let watcher: FSWatcher | null = null;
const listeners = new Set<ChangeListener>();

// Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Paths to watch
// ---------------------------------------------------------------------------
const SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");
const PLUGINS_DIR = path.join(os.homedir(), ".claude", "plugins");
const CLAUDE_MD_PATH = path.join(os.homedir(), ".claude", "CLAUDE.md");

// ---------------------------------------------------------------------------
// addChangeListener — register a listener for SSE push
// ---------------------------------------------------------------------------
export function addChangeListener(listener: ChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// notifyListeners — send event to all registered listeners
// ---------------------------------------------------------------------------
function notifyListeners(event: ChangeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors (e.g. closed SSE connections)
    }
  }
}

// ---------------------------------------------------------------------------
// debouncedRescan — debounce file changes, rescan, notify
// ---------------------------------------------------------------------------
function debouncedRescan(eventType: string, filePath: string): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    try {
      const existing = await readRegistry();
      const updated = await scanAll(existing);
      await writeRegistry(updated);

      notifyListeners({
        type: eventType,
        path: filePath,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[watcher] rescan failed:", err);
    }
  }, DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// startWatcher — begin watching skill directories and CLAUDE.md
// ---------------------------------------------------------------------------
export function startWatcher(): void {
  if (watcher) return; // Already running

  watcher = watch(
    [SKILLS_DIR, PLUGINS_DIR, CLAUDE_MD_PATH],
    {
      ignoreInitial: true,
      persistent: true,
      depth: 5,
      ignored: [
        /(^|[/\\])\../, // dotfiles
        /node_modules/,
        /_archived/,
      ],
    },
  );

  watcher.on("all", (event, filePath) => {
    debouncedRescan(event, filePath);
  });

  watcher.on("error", (err) => {
    console.error("[watcher] error:", err);
  });

  console.log("[watcher] started watching skill directories");
}

// ---------------------------------------------------------------------------
// stopWatcher — stop watching and clean up
// ---------------------------------------------------------------------------
export async function stopWatcher(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (watcher) {
    await watcher.close();
    watcher = null;
    console.log("[watcher] stopped");
  }
}
