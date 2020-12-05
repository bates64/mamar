export function detect_os() {
    const ua = navigator.userAgent

    if (/mac/i.test(ua)) {
        return "mac"
    }

    if (/win/i.test(ua)) {
        return "windows"
    }

    return "linux"
}
