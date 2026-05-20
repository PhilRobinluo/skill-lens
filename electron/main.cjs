/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

function logBootstrap(message, error) {
  const logPath = path.join(app.getPath("userData"), "startup.log");
  const detail = error ? ` ${error.stack || error.message || String(error)}` : "";
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}${detail}\n`);
}

logBootstrap("bootstrap main.cjs");

import("./main.mjs").catch((error) => {
  logBootstrap("failed to import main.mjs", error);
  app.quit();
});
