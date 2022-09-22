import { TableView, TableHeader, Column, Row, TableBody, Cell, View, DialogContainer, AlertDialog, Link } from "@adobe/react-spectrum"
import { Sbn, File, Song } from "pm64-typegen"
import { useMemo, useState } from "react"

import { names } from "./songNames.json"
import useDecodedSbn from "./useDecodedSbn"

import { openData, useRoot } from "../store"
import useRomData from "../util/hooks/useRomData"

import "./BgmFromSbnPicker.scss"

interface Item {
    id: number
    name: string
    file: File
    song: Song
}

function getRows(sbn: Sbn | null): Item[] {
    const items: Item[] = []

    if (sbn) {
        for (let i = 0; i < sbn.songs.length; i++) {
            const song = sbn.songs[i]

            items.push({
                id: i,
                name: names[i] ?? "",
                song,
                file: sbn.files[song.bgm_file],
            })
        }
    }

    return items
}

export default function BgmFromSbnPicker() {
    const [, dispatch] = useRoot()
    const [loadError, setLoadError] = useState<Error | null>(null)
    const romData = useRomData()
    const sbn = useDecodedSbn(romData)
    const items = useMemo(() => {
        return getRows(sbn)
    }, [sbn])

    return <View UNSAFE_className="BgmFromSbnPicker">
        <TableView
            aria-label="Song list"
            height="size-6000"
            isQuiet
            onAction={key => {
                const item = items.find(item => item.id.toString() === key)

                if (item) {
                    try {
                        const action = openData(new Uint8Array(item.file.data), item.name)
                        dispatch(action)
                    } catch (error) {
                        console.error(error)
                        if (error instanceof Error) {
                            setLoadError(error)
                        }
                    }
                }
            }}
        >
            <TableHeader>
                <Column width={60} align="end">ID</Column>
                <Column>Song</Column>
                <Column>Extra soundbanks</Column>
                <Column>Size</Column>
            </TableHeader>
            <TableBody items={items} loadingState={sbn === null ? "loading" : "idle"}>
                {row => (
                    <Row key={row.id}>
                        <Cell>
                            <code>{row.id.toString(16).toUpperCase()}</code>
                        </Cell>
                        <Cell>
                            {row.name}
                        </Cell>
                        <Cell>
                            {row.song.bk_a_file} {row.song.bk_b_file} {row.song.unk_file}
                        </Cell>
                        <Cell>
                            {(row.file.data.length / 1024).toFixed(1)} KB
                        </Cell>
                    </Row>
                )}
            </TableBody>
        </TableView>
        <DialogContainer onDismiss={() => setLoadError(null)}>
            {loadError && <AlertDialog
                title="Error loading song"
                variant="error"
                primaryActionLabel="OK"
            >
                Failed to decode the BGM.<br />
                If this is an unmodified ROM, please <Link><a href="https://github.com/nanaian/mamar/issues/new">report this as a bug</a></Link>.
                <pre>{loadError.message}</pre>
            </AlertDialog>}
        </DialogContainer>
    </View>
}
