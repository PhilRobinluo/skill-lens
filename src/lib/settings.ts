import fsp from "node:fs/promises";
import path from "node:path";

import { DATA_DIR } from "./config";
import type { AppSettings } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

function defaultSettings(): AppSettings {
  return {
    openRouterApiKey: "",
    aiModel: "google/gemini-2.5-flash",
  };
}

// ---------------------------------------------------------------------------
// readSettings — read runtime settings.json (or return defaults)
// ---------------------------------------------------------------------------
export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fsp.readFile(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as AppSettings;
    const safeSettings = {
      openRouterApiKey: parsed.openRouterApiKey,
      aiModel: parsed.aiModel,
    };
    return { ...defaultSettings(), ...safeSettings } as AppSettings;
  } catch {
    return defaultSettings();
  }
}

// ---------------------------------------------------------------------------
// writeSettings — write runtime settings.json
// ---------------------------------------------------------------------------
export async function writeSettings(settings: AppSettings): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const safeSettings = {
    openRouterApiKey: settings.openRouterApiKey,
    aiModel: settings.aiModel,
  };
  await fsp.writeFile(SETTINGS_PATH, JSON.stringify(safeSettings, null, 2) + "\n", "utf-8");
}
