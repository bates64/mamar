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
        height: 1000,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: "#1d1b23",
        darkTheme: true,
        frame: process.platform === "darwin" ? true : false, // TODO: make this an option on Linux/Windows
        titleBarStyle: "hidden",
        icon: path.join(__dirname, "icon.png"),
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
        },
        show: false,
    })

    // Add .blur class to body when window is unfocused
    win.on("blur",  () => win.webContents.executeJavaScript(`document.body.classList.add("blur")`))
    win.on("focus", () => win.webContents.executeJavaScript(`document.body.classList.remove("blur")`))

    // Add .maximized class to body when window is maximized
    win.on("maximize",   () => win.webContents.executeJavaScript(`document.body.classList.add("maximized")`))
    win.on("unmaximize", () => win.webContents.executeJavaScript(`document.body.classList.remove("maximized")`))

    // Show window when index.html loads
    win.on("ready-to-show", () => win.show())

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
