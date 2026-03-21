import { app, BrowserWindow, Tray, nativeImage, clipboard, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3939;
const BASE_URL = `http://localhost:${PORT}`;

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
  // Keep running in tray
});

// Hide dock icon — this is a menu bar app
app.dock?.hide();
