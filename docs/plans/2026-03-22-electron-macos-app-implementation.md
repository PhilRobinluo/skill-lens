# Electron macOS App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wrap the existing Skill Lens Next.js webapp in an Electron shell with a macOS menu bar tray panel for quick skill management.

**Architecture:** Electron main process manages two windows — a lightweight tray popup (loads `/tray` route) and a full main window (loads `/`). Next.js runs as an embedded server on port 3939. All existing APIs are reused as-is.

**Tech Stack:** Electron 35 + electron-builder + existing Next.js 16 + shadcn/ui

---

### Task 1: Install Electron Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install electron and build tools**

Run:
```bash
cd /Users/qihang/work/skill-manager
pnpm add -D electron electron-builder concurrently wait-on
```

**Step 2: Add electron scripts to package.json**

Add to `"scripts"`:
```json
"electron:dev": "concurrently -k \"next dev -p 3939\" \"wait-on http://localhost:3939 && electron electron/main.mjs\"",
"electron:build": "next build && electron-builder",
"electron:start": "electron electron/main.mjs"
```

**Step 3: Add electron-builder config to package.json**

Add top-level:
```json
"main": "electron/main.mjs",
"build": {
  "appId": "com.arthurai.skill-lens",
  "productName": "Skill Lens",
  "mac": {
    "category": "public.app-category.developer-tools",
    "icon": "resources/icon.icns",
    "target": ["dmg"]
  },
  "files": [
    ".next/**/*",
    "node_modules/**/*",
    "public/**/*",
    "package.json",
    "electron/**/*"
  ]
}
```

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add Electron dependencies and build config"
```

---

### Task 2: Create Electron Main Process

**Files:**
- Create: `electron/main.mjs`

**Step 1: Create electron directory**

```bash
mkdir -p /Users/qihang/work/skill-manager/electron
```

**Step 2: Write main.mjs**

```javascript
import { app, BrowserWindow, Tray, nativeImage, screen, clipboard, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3939;
const BASE_URL = `http://localhost:${PORT}`;
const isDev = !app.isPackaged;

let tray = null;
let trayWindow = null;
let mainWindow = null;

function createTrayWindow() {
  trayWindow = new BrowserWindow({
    width: 400,
    height: 560,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: "#09090b",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  trayWindow.loadURL(`${BASE_URL}/tray`);

  trayWindow.on("blur", () => {
    trayWindow.hide();
  });
}

function showTrayWindow() {
  if (!trayWindow) createTrayWindow();

  const trayBounds = tray.getBounds();
  const windowBounds = trayWindow.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  trayWindow.setPosition(x, y, false);
  trayWindow.show();
  trayWindow.focus();
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#09090b",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  mainWindow.loadURL(BASE_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "resources", "iconTemplate.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip("Skill Lens");

  tray.on("click", () => {
    if (trayWindow && trayWindow.isVisible()) {
      trayWindow.hide();
    } else {
      showTrayWindow();
    }
  });
}

// IPC handlers
ipcMain.handle("open-main-window", () => {
  createMainWindow();
  if (trayWindow) trayWindow.hide();
});

ipcMain.handle("copy-to-clipboard", (_event, text) => {
  clipboard.writeText(text);
});

app.whenReady().then(() => {
  createTray();
  createTrayWindow();
});

app.on("window-all-closed", (e) => {
  // Keep app running in tray even when all windows are closed
  e.preventDefault?.();
});

// macOS: don't quit when all windows closed (tray app)
app.dock?.hide();
```

**Step 3: Create preload.mjs**

```javascript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openMainWindow: () => ipcRenderer.invoke("open-main-window"),
  copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard"),
});
```

**Step 4: Commit**

```bash
git add electron/
git commit -m "feat: add Electron main process with tray + main window"
```

---

### Task 3: Create Menu Bar Tray Icon

**Files:**
- Create: `resources/iconTemplate.png` (22x22)
- Create: `resources/iconTemplate@2x.png` (44x44)

**Step 1: Create resources directory and generate placeholder icons**

```bash
mkdir -p /Users/qihang/work/skill-manager/resources
```

Use existing logo as base — scale down to tray icon size. macOS "Template" images should be black with alpha transparency (the OS handles dark/light mode).

For now, create a simple placeholder using the existing logo:

```bash
# If sips is available on macOS:
sips -z 44 44 /Users/qihang/work/skill-manager/public/logo-v5-transparent.png \
  --out /Users/qihang/work/skill-manager/resources/iconTemplate@2x.png
sips -z 22 22 /Users/qihang/work/skill-manager/public/logo-v5-transparent.png \
  --out /Users/qihang/work/skill-manager/resources/iconTemplate.png
```

**Step 2: Commit**

```bash
git add resources/
git commit -m "feat: add macOS tray icon templates"
```

---

### Task 4: Create Tray Panel Page + Component

**Files:**
- Create: `src/app/tray/layout.tsx`
- Create: `src/app/tray/page.tsx`
- Create: `src/components/tray-panel.tsx`

**Step 1: Create tray layout (no nav bar, minimal chrome)**

`src/app/tray/layout.tsx`:
```tsx
import { ThemeProvider } from "next-themes";
import "../globals.css";

export default function TrayLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body className="antialiased bg-zinc-950 text-zinc-50 overflow-hidden">
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Step 2: Create tray page**

`src/app/tray/page.tsx`:
```tsx
import { TrayPanel } from "@/components/tray-panel";

export default function TrayPage() {
  return <TrayPanel />;
}
```

**Step 3: Create TrayPanel component**

`src/components/tray-panel.tsx` — this is the core UI:

- Fetches `/api/tags` to get tag list
- Fetches `/api/skills` to get all skills with their tags and enabled status
- Groups skills by tag
- Renders collapsible tag sections
- Each skill row: name + copy button + enable/disable toggle
- Search bar at top
- Stats footer + "Open full window" button
- Calls existing toggle API for enable/disable
- Uses `window.electronAPI.copyToClipboard()` for copy
- Uses `window.electronAPI.openMainWindow()` to open full window

**Step 4: Commit**

```bash
git add src/app/tray/ src/components/tray-panel.tsx
git commit -m "feat: add tray panel page with tag-grouped skill list"
```

---

### Task 5: Wire Up and Test

**Step 1: Verify Next.js dev server works on port 3939**

```bash
cd /Users/qihang/work/skill-manager
pnpm dev -p 3939
# Visit http://localhost:3939/tray in browser to verify panel renders
```

**Step 2: Test Electron app**

```bash
pnpm electron:dev
```

Verify:
- Tray icon appears in menu bar
- Click tray → panel pops up
- Skills are grouped by tags
- Search filters work
- Copy button copies skill name
- Toggle switch enables/disables skills
- "Open full window" opens main window

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Skill Lens Electron macOS app with tray panel"
```

---

### Summary

| Task | Description | Est. |
|------|-------------|------|
| 1 | Install deps + config | 2 min |
| 2 | Electron main process | 5 min |
| 3 | Tray icons | 2 min |
| 4 | Tray panel page + component | 10 min |
| 5 | Wire up and test | 5 min |
