const { app, BrowserWindow } = require("electron")
const path = require("path")
const { autoUpdater } = require("electron-updater")

if (process.platform !== "darwin") { // Code-signing is required on macOS
    autoUpdater.checkForUpdatesAndNotify()
}

if (!app.isPackaged) {
    require("electron-reloader")(module, {
        "watchRenderer": false,
    })
}

function createWindow() {
    const win = new BrowserWindow({
        title: "Mamar",
        width: 1200,
        height: 800,
        backgroundColor: "#14161a",
        darkTheme: true,
        icon: path.join(__dirname, "icon.png"),
        webPreferences: {
            nodeIntegration: true,
        },
    })

    if (app.isPackaged) {
        win.loadFile("build/index.html")
    } else {
        win.loadURL("http://localhost:8080")
        win.webContents.openDevTools()
    }
}

app.whenReady()
    .then(createWindow)
    .catch(console.error)

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit()
    }
})

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})
