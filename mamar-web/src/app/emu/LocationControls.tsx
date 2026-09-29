import { ActionButton, Button, ButtonGroup, Content, Dialog, DialogTrigger, Divider, Flex, Heading, Item, Picker, Switch, TextField } from "@adobe/react-spectrum"
import { Bgm } from "pm64-typegen"

import styles from "./PlaybackControls.module.scss"

import { useBgm, useLocation } from "../store"
import { MixLevel } from "../store/doc"

export const DEFAULT_ALTERNATE_PARTS_NAME = "Alternate parts"

/** How many proximity mixes the song's branches choose between. */
export function mixCount(bgm: Bgm): number {
    return Math.max(0, ...Object.values(bgm.branches ?? {}).map(branch => branch.options.length))
}

export function hasAlternateParts(bgm: Bgm): boolean {
    return Object.values(bgm.track_lists).some(trackList => trackList.tracks.some(track => track.alternate_for != null))
}

export function mixName(bgm: Bgm, mix: number): string {
    return bgm.mix_names?.[mix] ?? `Mix ${mix}`
}

const LEVELS: { key: MixLevel, name: string }[] = [
    { key: "off", name: "Off" },
    { key: "near", name: "Near" },
    { key: "full", name: "Full" },
]

/** Chooses where in the game the song is heard: its proximity mix and level, and whether alternate parts play. */
export default function LocationControls() {
    const [bgm] = useBgm()
    const [location, setLocation] = useLocation()

    if (!bgm) {
        return null
    }

    const mixes = mixCount(bgm)
    const alternateParts = hasAlternateParts(bgm)
    if (mixes === 0 && !alternateParts) {
        return null
    }

    return <div className={styles.position} role="group" aria-label="Location">
        {mixes > 0 && <>
            <div className={styles.field}>
                <label className={styles.fieldName}>Mix</label>
                <Picker
                    aria-label="Mix"
                    isQuiet
                    selectedKey={String(location.mix)}
                    onSelectionChange={key => setLocation({ mix: Number(key) })}
                    items={Array.from({ length: mixes }, (_, mix) => ({ key: String(mix), name: mixName(bgm, mix) }))}
                >
                    {item => <Item key={item.key}>{item.name}</Item>}
                </Picker>
            </div>
            <div className={styles.field}>
                <label className={styles.fieldName}>Level</label>
                <Picker
                    aria-label="Level"
                    isQuiet
                    selectedKey={location.level}
                    onSelectionChange={key => setLocation({ level: key as MixLevel })}
                    items={LEVELS}
                >
                    {item => <Item key={item.key}>{item.name}</Item>}
                </Picker>
            </div>
        </>}
        {alternateParts && <div className={styles.field}>
            <label className={styles.fieldName}>{bgm.alternate_parts_name ?? DEFAULT_ALTERNATE_PARTS_NAME}</label>
            <Switch
                aria-label={bgm.alternate_parts_name ?? DEFAULT_ALTERNATE_PARTS_NAME}
                isSelected={location.alternateParts}
                onChange={on => setLocation({ alternateParts: on })}
            >
                {location.alternateParts ? "On" : "Off"}
            </Switch>
        </div>}
        <div className={styles.field}>
            <DialogTrigger>
                <ActionButton isQuiet aria-label="Rename mixes and alternate parts">Rename</ActionButton>
                {close => <NamesDialog close={close} mixes={mixes} alternateParts={alternateParts} />}
            </DialogTrigger>
        </div>
    </div>
}

function NamesDialog({ close, mixes, alternateParts }: { close: () => void, mixes: number, alternateParts: boolean }) {
    const [bgm, dispatch] = useBgm()

    if (!bgm) {
        return null
    }

    return <Dialog size="S">
        <Heading>Names</Heading>
        <Divider />
        <Content>
            <form onSubmit={e => {
                e.preventDefault()
                close()
            }}>
                <Flex direction="column" gap="size-100">
                    {alternateParts && <TextField
                        label="Alternate parts"
                        placeholder={DEFAULT_ALTERNATE_PARTS_NAME}
                        value={bgm.alternate_parts_name ?? ""}
                        onChange={name => dispatch({ type: "set_alternate_parts_name", name })}
                    />}
                    {Array.from({ length: mixes }, (_, mix) => <TextField
                        key={mix}
                        label={`Mix ${mix}`}
                        placeholder={`Mix ${mix}`}
                        value={bgm.mix_names?.[mix] ?? ""}
                        onChange={name => dispatch({ type: "set_mix_name", mix, name })}
                    />)}
                </Flex>
            </form>
        </Content>
        <ButtonGroup>
            <Button variant="cta" onPress={close}>Done</Button>
        </ButtonGroup>
    </Dialog>
}
