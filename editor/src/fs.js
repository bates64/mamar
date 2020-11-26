import { fileOpen, fileSave } from "browser-nativefs"

let recentHandle, recentName

export async function open_file(extensions, mimeTypes) {
    const blob = await fileOpen({
        extensions: extensions.split(" "),
        mimeTypes: mimeTypes.split(" "),
    })

    recentHandle = blob.handle // undefined in browsers that don't support the File System Access API e.g. Firefox
    recentName = blob.name

    return blob
}

export function recent_file_handle() {
    return recentHandle
}

export function recent_file_name() {
    return recentName || "Untitled"
}

// See also https://github.com/WICG/file-system-access/issues/80
export async function save_file(blob, fileName, extensions, mimeTypes, handle) {
    recentHandle = undefined // In case of error
    recentHandle = await fileSave(blob, {
        fileName,
        extensions: extensions.split(" "),
        mimeTypes: mimeTypes.split(" "),
    }, handle)
    recentName = recentHandle ? recentHandle.name : fileName
}
