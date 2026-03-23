import { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, ipcMain, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const isDev = !app.isPackaged;
const PORT = isDev ? 3939 : 3940;
const BASE_URL = `http://localhost:${PORT}`;

let tray = null;
let trayWindow = null;
let mainWindow = null;
let serverProcess = null;

// ---------- 内置 Next.js 服务器（打包后使用） ----------
function startServer() {
  if (isDev) return Promise.resolve(); // 开发模式由 concurrently 启动

  return new Promise((resolve, reject) => {
    // 打包后用 node 直接运行 next，避免 .bin 软链接问题
    const nextEntry = path.join(ROOT_DIR, "node_modules", "next", "dist", "bin", "next");
    serverProcess = spawn(process.execPath, [nextEntry, "start", "-p", String(PORT)], {
      cwd: ROOT_DIR,
      env: { ...process.env, NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1" },
      stdio: "pipe",
    });

    serverProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("Ready") || msg.includes("started")) resolve();
    });

    serverProcess.stderr.on("data", (data) => {
      console.error("[server]", data.toString());
    });

    // 超时 15 秒自动 resolve（服务器可能不输出 Ready）
    setTimeout(resolve, 15000);
  });
}

// ---------- 窗口 ----------
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
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#09090b",
    icon: path.join(ROOT_DIR, "public", "logo-v6-dock.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  mainWindow.loadURL(BASE_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------- 菜单栏 Tray ----------
function createTray() {
  const logoPath = path.join(ROOT_DIR, "public", "logo-v6-dock.png");
  const logoImage = nativeImage.createFromPath(logoPath);
  const icon = logoImage.resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip("Skill Lens — 技能透镜");

  tray.on("click", () => {
    if (trayWindow && trayWindow.isVisible()) {
      trayWindow.hide();
    } else {
      showTrayWindow();
    }
  });

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    { label: "打开面板", click: () => createMainWindow() },
    { label: "检查更新", click: () => {
      if (isDev) {
        dialog.showMessageBox({ message: "开发模式下不检查更新" });
      } else {
        autoUpdater.checkForUpdates();
      }
    }},
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]);
  tray.on("right-click", () => tray.popUpContextMenu(contextMenu));
}

// ---------- 自动更新 ----------
function setupAutoUpdater() {
  if (isDev) return; // 开发模式不检查更新

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
  if (trayWindow) trayWindow.hide();
});

ipcMain.handle("copy-to-clipboard", (_event, text) => {
  clipboard.writeText(text);
});

// ---------- 启动 ----------
app.whenReady().then(async () => {
  // 设置 Dock 图标
  const dockIcon = nativeImage.createFromPath(
    path.join(ROOT_DIR, "public", "logo-v6-dock.png")
  );
  if (app.dock) app.dock.setIcon(dockIcon);

  // 打包模式下先启动内置服务器
  await startServer();

  // 打开主窗口
  createMainWindow();

  // 菜单栏图标
  try {
    createTray();
    createTrayWindow();
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
  createMainWindow();
});

app.on("before-quit", () => {
  // 退出时关闭内置服务器
  if (serverProcess) serverProcess.kill();
});
