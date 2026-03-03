import fs from "node:fs";
import path from "node:path";
import { scanAll } from "./scanner";
import { readRegistry, writeRegistry } from "./registry";
import { startWatcher } from "./watcher";
import { DEMO_MODE, DATA_DIR } from "./config";

// ---------------------------------------------------------------------------
// Singleton: ensure server is initialized only once
// ---------------------------------------------------------------------------
let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureInitialized(): Promise<void> {
  if (initialized) return;

  // If already in progress, wait for it
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = doInit();
  await initPromise;
}

async function doInit(): Promise<void> {
  try {
    if (DEMO_MODE) {
      console.log("[init] demo mode — loading sample data...");
      const demoPath = path.join(DATA_DIR, "demo-registry.json");
      const registryPath = path.join(DATA_DIR, "skills-registry.json");
      if (fs.existsSync(demoPath)) {
        fs.copyFileSync(demoPath, registryPath);
      }
      console.log("[init] demo data loaded");
      initialized = true;
      return;
    }

    console.log("[init] running initial scan...");
    const existing = await readRegistry();
    const updated = await scanAll(existing);
    await writeRegistry(updated);
    console.log(
      `[init] scan complete: ${updated.meta.totalSkills} skills found`,
    );

    // Start file watcher for live updates
    startWatcher();

    initialized = true;
  } catch (err) {
    console.error("[init] initialization failed:", err);
    // Reset so next call retries
    initPromise = null;
    throw err;
  }
}
