import { fileOpen, FileWithHandle } from "browser-fs-access"
import { get, set } from "idb-keyval"

// A song made from a MIDI file remembers the file, by its import link's ID, so it can be reimported in one click, even
// after the page is reloaded. Only browsers with the File System Access API give file handles; others always pick.

const key = (linkId: number) => `midi_handle_${linkId}`

/** Permission methods Chromium has on file handles, which TypeScript's DOM types don't include. */
interface PermissionHandle {
    queryPermission?(options: { mode: "read" }): Promise<PermissionState>
    requestPermission?(options: { mode: "read" }): Promise<PermissionState>
}

export async function rememberMidi(linkId: number, handle: FileSystemFileHandle) {
    try {
        await set(key(linkId), handle)
    } catch (error) {
        console.warn("couldn't remember the MIDI file", error)
    }
}

/**
 * Reads the MIDI file remembered for import link `linkId`, asking for permission to if the browser needs it, which only
 * works in response to a click. Returns null if there's no remembered file, permission is refused, or the file is gone.
 */
export async function readRememberedMidi(linkId: number): Promise<File | null> {
    try {
        const handle = await get<FileSystemFileHandle>(key(linkId))
        if (!handle) {
            return null
        }
        const permission = handle as PermissionHandle
        const options = { mode: "read" } as const
        if (permission.queryPermission && await permission.queryPermission(options) !== "granted") {
            if (!permission.requestPermission || await permission.requestPermission(options) !== "granted") {
                return null
            }
        }
        return await handle.getFile()
    } catch (error) {
        console.warn("couldn't read the remembered MIDI file", error)
        return null
    }
}

export function pickMidi(): Promise<FileWithHandle> {
    return fileOpen({
        extensions: [".mid", ".midi"],
        description: "MIDI files",
        id: "midi_reimport",
    })
}
