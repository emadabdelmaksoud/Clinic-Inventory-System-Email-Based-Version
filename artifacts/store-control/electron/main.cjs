const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "AUC Clinic Inventory",
    icon: path.join(__dirname, "..", "dist", "electron", "icon.png"),
    show: false,
  });

  win.once("ready-to-show", () => win.show());

  const indexPath = path.join(__dirname, "..", "dist", "electron", "index.html");
  win.loadFile(indexPath);

  Menu.setApplicationMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
