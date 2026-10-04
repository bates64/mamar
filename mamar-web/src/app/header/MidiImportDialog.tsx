import { Button, ButtonGroup, Content, Dialog, Divider, Heading, Radio, RadioGroup } from "@adobe/react-spectrum"
import { MidiMapping } from "pm64-typegen"
import { useState } from "react"

import styles from "./MidiImportDialog.module.scss"

/** Where the last choice is kept, to choose it again next time. */
const STORAGE_KEY = "midiMapping"

function lastChoice(): MidiMapping {
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved === "GeneralMidi" || saved === "PaperMario") {
            return saved
        }
    } catch {
        // Storage can be unavailable, such as in a private window
    }
    return "GeneralMidi"
}

function remember(mapping: MidiMapping) {
    try {
        localStorage.setItem(STORAGE_KEY, mapping)
    } catch {
        // Storage can be unavailable, such as in a private window
    }
}

/**
 * Asks which soundfont MIDI file `name` was made for, which says how to read its programs and drum notes, starting on
 * the last choice.
 */
export default function MidiImportDialog({ name, onImport, onCancel }: {
    name: string
    onImport(mapping: MidiMapping): void
    onCancel(): void
}) {
    const [mapping, setMapping] = useState<MidiMapping>(lastChoice)

    return <Dialog size="M">
        <Heading>Import MIDI</Heading>
        <Divider />
        <Content>
            <RadioGroup
                label={<span>Which soundfont does <code className={styles.fileName}>{name}</code> use?</span>}
                value={mapping}
                onChange={value => setMapping(value as MidiMapping)}
            >
                <Radio value="GeneralMidi">
                    <span className={styles.option}>
                        General MIDI
                        <span className={styles.description}>
                            Most MIDI files. Each instrument plays the closest Paper Mario sample.
                        </span>
                    </span>
                </Radio>
                <Radio value="PaperMario">
                    <span className={styles.option}>
                        Paper Mario
                        <span className={styles.description}>
                            Files made with the Paper Mario soundfont, whose instruments are the game&apos;s own
                            samples.
                        </span>
                    </span>
                </Radio>
            </RadioGroup>
        </Content>
        <ButtonGroup>
            <Button variant="secondary" onPress={onCancel}>Cancel</Button>
            <Button
                variant="accent"
                autoFocus
                onPress={() => {
                    remember(mapping)
                    onImport(mapping)
                }}
            >
                Import
            </Button>
        </ButtonGroup>
    </Dialog>
}
