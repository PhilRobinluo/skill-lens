import { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, ipcMain, dialog, screen } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const isDev = !app.isPackaged;
const PORT = isDev ? 3939 : 3940;
const BASE_URL = `http://localhost:${PORT}`;
const MENU_BAR_ONLY = process.env.SKILL_LENS_DOCK !== "1";
const SHOW_TRAY_ON_LAUNCH = process.env.SKILL_LENS_SHOW_TRAY_ON_LAUNCH === "1";
const LOG_PATH = path.join(app.getPath("userData"), "startup.log");

let tray = null;
let trayWindow = null;
let mainWindow = null;
let serverProcess = null;
let trayExpanded = false;

const TRAY_COLLAPSED_SIZE = { width: 420, height: 640 };
const TRAY_EXPANDED_SIZE = { width: 760, height: 640 };

function logStartup(message, error) {
  const detail = error ? ` ${error.stack || error.message || String(error)}` : "";
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}${detail}\n`);
}

// ---------- 内置 Next.js 服务器（打包后使用） ----------
function startServer() {
  logStartup(`boot isDev=${isDev} app.isPackaged=${app.isPackaged} root=${ROOT_DIR} port=${PORT}`);
  if (isDev) return Promise.resolve(); // 开发模式由 concurrently 启动

  return new Promise((resolve) => {
    // 打包后用 node 直接运行 next，避免 .bin 软链接问题
    const nextEntry = path.join(ROOT_DIR, "node_modules", "next", "dist", "bin", "next");
    logStartup(`starting next server entry=${nextEntry}`);
    serverProcess = spawn(process.execPath, [nextEntry, "start", "-p", String(PORT)], {
      cwd: ROOT_DIR,
      env: { ...process.env, NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1" },
      stdio: "pipe",
    });

    serverProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      logStartup(`[next:stdout] ${msg.trim()}`);
      if (msg.includes("Ready") || msg.includes("started")) resolve();
    });

    serverProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      logStartup(`[next:stderr] ${msg.trim()}`);
      console.error("[server]", msg);
    });

    serverProcess.on("error", (error) => {
      logStartup("[next:error]", error);
      resolve();
    });

    serverProcess.on("exit", (code, signal) => {
      logStartup(`[next:exit] code=${code} signal=${signal}`);
    });

    // 超时 15 秒自动 resolve（服务器可能不输出 Ready）
    setTimeout(() => {
      logStartup("next server wait timeout");
      resolve();
    }, 15000);
  });
}

// ---------- 窗口 ----------
function createTrayWindow() {
  const traySize = trayExpanded ? TRAY_EXPANDED_SIZE : TRAY_COLLAPSED_SIZE;

  trayWindow = new BrowserWindow({
    width: traySize.width,
    height: traySize.height,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    transparent: false,
    backgroundColor: "#09090b",
    title: "Skill Lens Quick Panel",
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  trayWindow.loadURL(`${BASE_URL}/tray`);
  trayWindow.setAlwaysOnTop(true, "screen-saver");
  trayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  trayWindow.on("blur", () => {
    trayWindow?.hide();
  });

  trayWindow.webContents.on("page-title-updated", (event, title) => {
    if (title === "skill-lens-tray-expanded") {
      event.preventDefault();
      setTrayExpanded(true, "title");
    } else if (title === "skill-lens-tray-collapsed") {
      event.preventDefault();
      setTrayExpanded(false, "title");
    }
  });
}

function showTrayWindow() {
  if (!trayWindow) createTrayWindow();

  positionTrayWindow(false);
  trayWindow.show();
  trayWindow.focus();
  const { x, y, width, height } = trayWindow.getBounds();
  logStartup(`show tray window x=${x} y=${y} w=${width} h=${height} visible=${trayWindow.isVisible()}`);
}

function positionTrayWindow(animated = false) {
  if (!trayWindow || trayWindow.isDestroyed()) return;
  const windowBounds = trayWindow.getBounds();
  const workArea = screen.getPrimaryDisplay().workArea;
  const x = Math.round(workArea.x + workArea.width - windowBounds.width - 18);
  const y = Math.round(workArea.y + 18);

  trayWindow.setPosition(x, y, animated);
}

function setTrayExpanded(expanded, reason = "ipc") {
  trayExpanded = expanded;
  if (!trayWindow || trayWindow.isDestroyed()) return;

  const traySize = trayExpanded ? TRAY_EXPANDED_SIZE : TRAY_COLLAPSED_SIZE;
  trayWindow.setSize(traySize.width, traySize.height, true);
  positionTrayWindow(true);
  const { x, y, width, height } = trayWindow.getBounds();
  logStartup(`set tray expanded=${trayExpanded} reason=${reason} x=${x} y=${y} w=${width} h=${height}`);
}

function toggleTrayWindow() {
  if (trayWindow && trayWindow.isVisible()) {
    trayWindow.hide();
  } else {
    showTrayWindow();
  }
}

function closeTrayWindow() {
  if (trayWindow && !trayWindow.isDestroyed()) {
    trayWindow.destroy();
  }
  trayWindow = null;
  trayExpanded = false;
}

function createMainWindow() {
  closeTrayWindow();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#09090b",
    icon: path.join(ROOT_DIR, "public", "logo-v6-dock.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.loadURL(BASE_URL);
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // 注入 CSS：为红绿灯按钮留出左侧空间
  mainWindow.webContents.on("dom-ready", () => {
    mainWindow.webContents.insertCSS(
      "nav > div:first-child { padding-left: 5rem !important; }"
    );
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------- 菜单栏 Tray ----------
function createTray() {
  const templatePath = path.join(ROOT_DIR, "resources", "lampTemplate.png");
  const fallbackPath = path.join(ROOT_DIR, "public", "logo-v6-dock.png");
  const logoPath = nativeImage.createFromPath(templatePath).isEmpty() ? fallbackPath : templatePath;
  const logoImage = nativeImage.createFromPath(logoPath);
  const icon = logoImage.resize({ width: 18, height: 18 });
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Skill Lens — 技能透镜");

  tray.on("click", toggleTrayWindow);

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    { label: "显示快速面板", click: () => showTrayWindow() },
    { label: "打开完整面板", click: () => createMainWindow() },
    { label: "刷新快速面板", click: () => trayWindow?.reload() },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]);
  tray.on("right-click", () => tray.popUpContextMenu(contextMenu));
}

// ---------- 自动更新 ----------
function setupAutoUpdater() {
  if (isDev) return; // 开发模式不检查更新
  if (process.env.SKILL_LENS_ENABLE_UPDATES !== "1") return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (error) {
    logStartup("auto-updater disabled", error);
    return;
  }

  autoUpdater.autoDownload = false; // 不自动下载，先问用户

  autoUpdater.on("update-available", (info) => {
    dialog.showMessageBox({
      type: "info",
      title: "发现新版本",
      message: `Skill Lens ${info.version} 已发布！`,
      detail: "要现在下载更新吗？",
      buttons: ["下载更新", "以后再说"],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on("update-downloaded", () => {
    dialog.showMessageBox({
      type: "info",
      title: "更新已下载",
      message: "新版本已下载完成，重启后生效。",
      buttons: ["立即重启", "稍后重启"],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-update error:", err);
  });

  // 启动后 5 秒检查一次，之后每 4 小时检查一次
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

// ---------- IPC ----------
ipcMain.handle("open-main-window", () => {
  createMainWindow();
});

ipcMain.handle("copy-to-clipboard", (_event, text) => {
  clipboard.writeText(text);
});

ipcMain.handle("set-tray-expanded", (_event, expanded) => {
  setTrayExpanded(Boolean(expanded));
});

// ---------- 启动 ----------
app.whenReady().then(async () => {
  if (MENU_BAR_ONLY && process.platform === "darwin") app.setActivationPolicy("accessory");
  if (MENU_BAR_ONLY && app.dock) app.dock.hide();

  // 设置 Dock 图标
  const dockIcon = nativeImage.createFromPath(
    path.join(ROOT_DIR, "public", "logo-v6-dock.png")
  );
  if (app.dock && !MENU_BAR_ONLY) app.dock.setIcon(dockIcon);

  // 打包模式下先启动内置服务器
  await startServer();

  // 菜单栏图标
  try {
    createTray();
    createTrayWindow();
    if (SHOW_TRAY_ON_LAUNCH) showTrayWindow();
  } catch (e) {
    console.error("Tray creation failed:", e);
  }

  // 自动更新
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  // macOS 上关闭窗口不退出 app
});

app.on("activate", () => {
  if (mainWindow) {
    createMainWindow();
  } else {
    showTrayWindow();
  }
});

app.on("before-quit", () => {
  // 退出时关闭内置服务器
  if (serverProcess) serverProcess.kill();
});
