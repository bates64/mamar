const { getCurrentWindow } = require("electron").remote

export function minimize() {
    getCurrentWindow().minimize()
}

export function toggle_maximize() {
    const win = getCurrentWindow()

    if (win.isMaximized()) {
        win.restore()
    } else {
        win.maximize()
    }
}

export function close() {
    getCurrentWindow().close()
}
