import { Text, Content, Dialog, Divider, Heading, Flex, ButtonGroup, Button, useDialogContainer } from "@adobe/react-spectrum"
import Alert from "@spectrum-icons/workflow/Alert"
import { get, set } from "idb-keyval"
import { useState } from "react"

let rom: ArrayBuffer
let loadingRom = true
const romPromise = get("rom_papermario_us").then(romData => {
    loadingRom = false
    if (romData && isPaperMario(romData)) {
        rom = romData
    }
})

function getRomName(romData: ArrayBuffer) {
    const romName = new Uint8Array(romData, 0x20, 20)
    return String.fromCharCode(...romName)
}

function isPaperMario(romData: ArrayBuffer) {
    return getRomName(romData) === "PAPER MARIO         "
}

export function useCachedPaperMarioUsRom(): ArrayBuffer | undefined {
    if (loadingRom) {
        throw romPromise
    }

    return rom
}

export interface Props {
    onChange: (romData: ArrayBuffer) => void
}

export default function PaperMarioRomInput({ onChange }: Props) {
    const [error, setError] = useState<boolean>(false)
    const dialog = useDialogContainer()

    return <Dialog size="S">
        <Heading>ROM required</Heading>
        <Divider />
        <ButtonGroup>
            <Button variant="primary" onPress={dialog.dismiss}>Cancel</Button>
        </ButtonGroup>
        <Content>
            <Text>
                Playback requires a Paper Mario (US) ROM.
            </Text>
            <Flex marginTop="size-200" width="100%" height="size-400" alignItems="center">
                <input
                    autoFocus
                    aria-label="Paper Mario ROM"
                    type="file"
                    accept=".z64"
                    onChange={async evt => {
                        const file = (evt.target as HTMLInputElement).files?.[0]
                        const rom = await file?.arrayBuffer()

                        if (!rom || !isPaperMario(rom)) {
                            setError(true)
                            return
                        }

                        dialog.dismiss()
                        onChange(rom)
                        await set("rom_papermario_us", rom)
                    }}
                />
                {error && <div title="The selected file is not Paper Mario (US).">
                    <Alert color="negative" />
                </div>}
            </Flex>
        </Content>
    </Dialog>
}
