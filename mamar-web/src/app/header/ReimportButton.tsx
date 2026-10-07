import { ActionButton, AlertDialog, Content, DialogContainer, Text, Tooltip, TooltipTrigger } from "@adobe/react-spectrum"
import { Report } from "pm64-typegen"
import { useEffect, useState } from "react"

import Bridge from "../bridge"
import { sampleReach } from "../doc/pitchLimit"
import { useDoc } from "../store"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"
import { pickMidi, readRememberedMidi, rememberMidi } from "../util/midiHandles"

/** What went wrong in a reimport, shown in a dialog. A reimport that went fine says so in the tooltip for a moment. */
interface Problems {
    title: string
    lines: string[]
}

/** What a reimport did, or null if it did nothing, or showed a dialog of what went wrong. */
export type ReimportResult = "Reimported" | "No changes" | null

/**
 * Reimports the MIDI file the song was made from, keeping what was changed in Mamar. `reimport` reads the remembered
 * file, or picks one if `pick` is set or the file can't be read. Render `dialog`, which shows what went wrong.
 */
export function useReimport() {
    const [doc, docDispatch] = useDoc()
    const sbn = useOptionalSoundBank()
    const [problems, setProblems] = useState<Problems | null>(null)
    const link = doc?.bgm.import

    const reimport = async (pick: boolean): Promise<ReimportResult> => {
        if (!doc || !link) {
            return null
        }
        let file: File | null = pick ? null : await readRememberedMidi(link.id)
        let handle: FileSystemFileHandle | undefined
        if (!file) {
            try {
                const picked = await pickMidi()
                file = picked
                handle = picked.handle
            } catch {
                // Cancelled
                return null
            }
        }

        const data = new Uint8Array(await file.arrayBuffer())
        const reimported: { bgm: typeof doc.bgm, base: Uint8Array, report: Report } | string =
            Bridge.bgm_reimport(doc.bgm, doc.importBase, data, file.name, sbn ? sampleReach(sbn) : new Uint8Array())
        if (typeof reimported === "string") {
            setProblems({ title: "Couldn't reimport", lines: [reimported] })
            return null
        }

        if (handle) {
            await rememberMidi(link.id, handle)
        }
        const { report } = reimported
        if (report.unchanged) {
            return "No changes"
        }
        docDispatch({ type: "reimport", bgm: reimported.bgm, importBase: reimported.base })
        if (report.problems.length > 0) {
            setProblems({ title: `Reimported ${file.name}`, lines: report.problems })
            return null
        }
        return "Reimported"
    }

    const dialog = <DialogContainer onDismiss={() => setProblems(null)}>
        {problems && <AlertDialog title={problems.title} variant="warning" primaryActionLabel="OK">
            <Content>
                {problems.lines.length === 1
                    ? <Text>{problems.lines[0]}</Text>
                    : <ul>{problems.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>}
            </Content>
        </AlertDialog>}
    </DialogContainer>

    return { link, reimport, dialog }
}

/**
 * Reimports the MIDI file the song was made from. Only shown for songs made from a MIDI file. Reads the remembered file
 * in one click; Shift-click, or a file that can't be read, picks one instead.
 */
export default function ReimportButton() {
    const { link, reimport, dialog } = useReimport()
    const [done, setDone] = useState<ReimportResult>(null)
    const [isHovered, setHovered] = useState(false)

    useEffect(() => {
        if (done) {
            const timeout = setTimeout(() => setDone(null), 2000)
            return () => clearTimeout(timeout)
        }
    }, [done])

    if (!link) {
        return null
    }

    return <>
        <TooltipTrigger isOpen={done !== null || isHovered} onOpenChange={setHovered}>
            <ActionButton onPress={async evt => setDone(await reimport(evt.shiftKey))} isQuiet>
                Reimport
            </ActionButton>
            {done
                ? <Tooltip variant={done === "Reimported" ? "positive" : "neutral"}>{done}</Tooltip>
                : <Tooltip>Update from {link.source_name || "the MIDI file"}. Shift-click to choose another file.</Tooltip>}
        </TooltipTrigger>

        {dialog}
    </>
}
