import fsp from "node:fs/promises";
import path from "node:path";

import type { AppSettings } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

function defaultSettings(): AppSettings {
  return {
    openRouterApiKey: "",
    aiModel: "google/gemini-2.5-flash",
  };
}

// ---------------------------------------------------------------------------
// readSettings — read data/settings.json (or return defaults)
// ---------------------------------------------------------------------------
export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fsp.readFile(SETTINGS_PATH, "utf-8");
    return { ...defaultSettings(), ...JSON.parse(raw) } as AppSettings;
  } catch {
    return defaultSettings();
  }
}

// ---------------------------------------------------------------------------
// writeSettings — write to data/settings.json
// ---------------------------------------------------------------------------
export async function writeSettings(settings: AppSettings): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}
