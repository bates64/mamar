import { toKeyEvent } from "keyboardevent-from-electron-accelerator"

const listeners = []

export function bind_key(key, callback) {
    const expected = toKeyEvent(key)

    const listener = event => {
        for (let [key, value] of Object.entries(expected)) {
            let trueValue = event[key]

            // Mitigates an inconsistency with the casing of event.key across browsers when shift is held
            if (expected.shiftKey && key === "key") {
                // Compare values case-insensitively
                value = value.toUpperCase()
                trueValue = trueValue.toUpperCase()
            }

            if (trueValue !== value) {
                return
            }
        }

        // It's a match!
        event.preventDefault()
        callback()
    }

    document.addEventListener("keydown", listener)
    listeners.push(listener)
}

export function unbind_all() {
    while (listeners.length > 0) {
        document.removeEventListener("keydown", listeners.pop())
    }
}
