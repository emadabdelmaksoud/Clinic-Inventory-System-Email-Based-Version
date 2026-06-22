"use strict";
const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: "Clinic Inventory",
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
    titleBarStyle: "default",
  });

  const indexPath = path.join(__dirname, "dist", "public", "index.html");
  mainWindow.loadFile(indexPath);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => { if (mainWindow) mainWindow.reload(); },
        },
        { type: "separator" },
        { label: "Quit", accelerator: "Alt+F4", role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Fullscreen", accelerator: "F11",         role: "togglefullscreen" },
        { label: "Zoom In",           accelerator: "CmdOrCtrl+=", role: "zoomin" },
        { label: "Zoom Out",          accelerator: "CmdOrCtrl+-", role: "zoomout" },
        { label: "Reset Zoom",        accelerator: "CmdOrCtrl+0", role: "resetzoom" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Clinic Inventory",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              title: "About Clinic Inventory",
              message: "Clinic Inventory v1.0",
              detail:
                "AUC Clinic Inventory System\n\n" +
                "All data is stored locally on this device.\n" +
                "No internet connection required.",
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
