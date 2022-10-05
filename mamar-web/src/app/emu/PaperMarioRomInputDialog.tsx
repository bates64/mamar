import { Text, Content, Dialog, Divider, Heading, Flex, useDialogContainer } from "@adobe/react-spectrum"
import Alert from "@spectrum-icons/workflow/Alert"
import { useState } from "react"

function getRomName(romData: ArrayBuffer) {
    const romName = new Uint8Array(romData, 0x20, 20)
    return String.fromCharCode(...romName)
}

export function isPaperMario(romData: ArrayBuffer) {
    return getRomName(romData) === "PAPER MARIO         "
}

export interface Props {
    onChange: (romData: ArrayBuffer) => void
}

export default function PaperMarioRomInput({ onChange }: Props) {
    const [error, setError] = useState<boolean>(false)
    const dialog = useDialogContainer()

    return <Dialog size="M">
        <Heading>ROM required</Heading>
        <Divider />
        <Content>
            <Text>
                Mamar requires a clean Paper Mario (US) ROM in z64 format.<br />
                Please select a ROM file to continue.
            </Text>
            <Flex marginTop="size-200" width="100%" height="size-400" alignItems="center">
                <input
                    autoFocus
                    aria-label="Upload Paper Mario ROM file"
                    type="file"
                    accept=".z64"
                    onChange={async evt => {
                        const file = (evt.target as HTMLInputElement).files?.[0]
                        const data = await file?.arrayBuffer()

                        if (!data || !isPaperMario(data)) {
                            setError(true)
                            return
                        }

                        dialog.dismiss()
                        onChange(data)
                    }}
                />
                {error && <div title="The selected file is not Paper Mario (US).">
                    <Alert color="negative" />
                </div>}
            </Flex>
        </Content>
    </Dialog>
}
