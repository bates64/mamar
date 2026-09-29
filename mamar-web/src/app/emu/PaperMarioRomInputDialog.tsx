import { Text, Content, Dialog, Divider, Heading, Flex, useDialogContainer } from "@adobe/react-spectrum"
import Alert from "@spectrum-icons/workflow/Alert"
import { useState } from "react"

import { findSoundBank } from "../util/soundBank"

export interface Props {
    /** Called with the sound bank (SBN) of the ROM the user selects. */
    onChange: (sbn: ArrayBuffer) => void
}

export default function PaperMarioRomInput({ onChange }: Props) {
    const [error, setError] = useState<boolean>(false)
    const dialog = useDialogContainer()

    return <Dialog size="M">
        <Heading>ROM required</Heading>
        <Divider />
        <Content>
            <Text>
                Mamar plays songs with the instruments in your Paper Mario (US) ROM, in z64 format. A mod's ROM
                works too.
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
                        const sbn = data && findSoundBank(data)

                        if (!sbn) {
                            setError(true)
                            return
                        }

                        dialog.dismiss()
                        onChange(sbn)
                    }}
                />
                {error && <div title="The selected file isn't a Paper Mario ROM.">
                    <Alert color="negative" />
                </div>}
            </Flex>
        </Content>
    </Dialog>
}
