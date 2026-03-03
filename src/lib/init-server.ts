import { scanAll } from "./scanner";
import { readRegistry, writeRegistry } from "./registry";
import { startWatcher } from "./watcher";

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
