import { ActionButton, Button, ButtonGroup, Content, Dialog, DialogTrigger, Divider, Flex, Heading, Item, NumberField, Picker, ProgressBar, Text } from "@adobe/react-spectrum"
import { fileSave } from "browser-fs-access"
import { useEffect, useState } from "react"

import { encodeWav, loopsForever, renderSong, SAMPLE_RATE } from "../emu/exportSong"
import { canEncodeOpus, encodeOggOpus } from "../emu/oggOpus"
import { useDoc, useLocation, useVariation } from "../store"
import { proximityMixValue } from "../store/doc"
import { useOptionalSoundBank } from "../util/hooks/useSoundBank"
import { encodeForGame } from "../util/recordings"

/** Where the export settings are remembered between visits. */
const SETTINGS_KEY = "mamar.export"

interface ExportSettings {
    /** How many times a song that loops forever plays its loop before it fades out. */
    loops: number
    /** How long the fade out lasts, in seconds. */
    fadeSeconds: number
    format: Format
}

/** A file type the song can be exported as: uncompressed WAV, or compressed Ogg Opus where the browser can encode it. */
type Format = "wav" | "ogg"

const FORMATS: { key: Format, name: string, extension: string }[] = [
    { key: "wav", name: "WAV (uncompressed)", extension: ".wav" },
    { key: "ogg", name: "Ogg Opus (compressed)", extension: ".ogg" },
]

// Ogg where the browser can encode it, as it's much smaller
const DEFAULT_SETTINGS: ExportSettings = { loops: 2, fadeSeconds: 10, format: "ogg" }

function loadSettings(): ExportSettings {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") }
    } catch {
        return DEFAULT_SETTINGS
    }
}

function saveSettings(settings: ExportSettings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
        // The settings are only a convenience
    }
}

function fileName(name: string, extension: string): string {
    return name.replace(/\.(bgm|ron|mid|midi)$/i, "") + extension
}

/** Exports the song as an audio file, as the game plays it, with the variation and mix being listened to. */
export default function ExportButton() {
    const [doc] = useDoc()
    const [variation] = useVariation()
    const [location] = useLocation()
    const sbn = useOptionalSoundBank()
    const [settings, setSettings] = useState(loadSettings)
    const [progress, setProgress] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [canOgg, setCanOgg] = useState(false)
    useEffect(() => {
        canEncodeOpus().then(setCanOgg)
    }, [])
    const format = FORMATS.find(({ key }) => key === (canOgg ? settings.format : "wav"))!

    const change = (changed: Partial<ExportSettings>) => {
        const next = { ...settings, ...changed }
        setSettings(next)
        saveSettings(next)
    }
    const segments = variation?.segments ?? []
    const isLooping = loopsForever(segments)

    const exportWav = async (close: () => void) => {
        if (!doc || !sbn) return
        setError(null)
        setProgress(0)
        try {
            const samples = await renderSong({
                bgm: encodeForGame(doc.bgm, sbn),
                variation: doc.activeVariation,
                sbn,
                proximityMix: proximityMixValue(location),
                alternateParts: location.alternateParts,
                loops: settings.loops,
                fadeSeconds: settings.fadeSeconds,
                onProgress: setProgress,
            }, segments)
            const file = format.key === "ogg" ? await encodeOggOpus(samples, SAMPLE_RATE) : encodeWav(samples)
            close()
            await fileSave(file, { fileName: fileName(doc.name, format.extension), extensions: [format.extension], startIn: "music" })
        } catch (e) {
            // Choosing not to save isn't an error
            if (!(e instanceof DOMException && e.name === "AbortError")) {
                setError(e instanceof Error ? e.message : String(e))
            }
        } finally {
            setProgress(null)
        }
    }

    return <DialogTrigger>
        <ActionButton isQuiet isDisabled={!doc || !sbn}>Export</ActionButton>
        {close => <Dialog size="S">
            <Heading>Export</Heading>
            <Divider />
            <Content>
                <Flex direction="column" gap="size-150">
                    {canOgg && <Picker
                        label="Format"
                        width="100%"
                        selectedKey={format.key}
                        onSelectionChange={key => change({ format: key as Format })}
                        items={FORMATS}
                    >
                        {item => <Item key={item.key}>{item.name}</Item>}
                    </Picker>}
                    {isLooping
                        ? <>
                            <Text>This song loops forever, so it plays its loop a number of times and then fades out.</Text>
                            <NumberField
                                label="Times to play the loop"
                                value={settings.loops}
                                minValue={1}
                                maxValue={20}
                                onChange={loops => !Number.isNaN(loops) && change({ loops })}
                            />
                            <NumberField
                                label="Fade out (seconds)"
                                value={settings.fadeSeconds}
                                minValue={0}
                                maxValue={60}
                                onChange={fadeSeconds => !Number.isNaN(fadeSeconds) && change({ fadeSeconds })}
                            />
                        </>
                        : <Text>This song plays once, to its end.</Text>}
                    {progress !== null && <ProgressBar label="Rendering" value={progress * 100} width="100%" />}
                    {error && <Text UNSAFE_style={{ color: "var(--spectrum-red-900)" }}>Couldn't export this song: {error}</Text>}
                </Flex>
            </Content>
            <ButtonGroup>
                <Button variant="secondary" onPress={close} isDisabled={progress !== null}>Cancel</Button>
                <Button variant="accent" onPress={() => exportWav(close)} isDisabled={progress !== null}>Export</Button>
            </ButtonGroup>
        </Dialog>}
    </DialogTrigger>
}
