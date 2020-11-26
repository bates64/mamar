const { app, BrowserWindow } = require("electron")
const path = require("path")
const fs = require("fs")

if (!app.isPackaged) {
    require("electron-reloader")(module, {
        "watchRenderer": false,
    })
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
        },
    })

    if (app.isPackaged) {
        // TODO
        win.loadFile("index.html")
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
