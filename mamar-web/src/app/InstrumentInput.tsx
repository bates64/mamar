import { ActionButton, Content, Dialog, DialogTrigger, Flex, Form, Heading, NumberField } from "@adobe/react-spectrum"
import { PatchAddress } from "pm64-typegen"

import { EnvelopeSelect, InstrumentFields, SampleSelect } from "./doc/InstrumentEditor"
import styles from "./InstrumentInput.module.scss"
import * as instruments from "./instruments"
import { useBgm } from "./store"

export interface Props {
    index: number
    onChange(index: number): void
}

export default function InstrumentInput({ index, onChange }: Props) {
    const [bgm, dispatch] = useBgm()
    const instrument = bgm?.instruments[index]

    const name = instrument ? instruments.getName(instrument.patch, bgm?.aux_banks) : ""

    return <DialogTrigger type="popover" placement="right">
        <ActionButton UNSAFE_className={styles.actionButton}>
            #{index} {name ? `(${name})` : ""}
        </ActionButton>
        <Dialog minWidth="500px">
            <Heading>
                <Flex justifyContent="space-between">
                    <span>Instrument {index}</span>

                    {bgm && <NumberField
                        aria-label="Instrument index"
                        value={index}
                        onChange={onChange}
                        minValue={0}
                        maxValue={bgm.instruments.length - 1}
                        step={1}
                    />}
                </Flex>
            </Heading>
            <Content>
                {instrument && <Form isQuiet onSubmit={e => e.preventDefault()}>
                    <InstrumentFields instrument={instrument} onChange={partial => dispatch({ type: "update_instrument", index, partial })} />
                </Form>}
            </Content>
        </Dialog>
    </DialogTrigger>
}

// Same as InstrumentInput but operates on a PatchAddress instead of an entire instrument
export function PatchInput({ patch, onChange }: { patch: PatchAddress, onChange: (patch: PatchAddress) => void }) {
    const [bgm] = useBgm()
    const name = instruments.getName(patch, bgm?.aux_banks)
    return <DialogTrigger type="popover" placement="right">
        <ActionButton UNSAFE_className={styles.actionButton}>
            {name}
        </ActionButton>
        <Dialog minWidth="500px">
            <Content>
                <Form isQuiet onSubmit={e => e.preventDefault()}>
                    <Flex gap="size-150">
                        <SampleSelect patch={patch} onChange={patch => onChange(patch)} />
                        <EnvelopeSelect patch={patch} onChange={onChange} />
                    </Flex>
                </Form>
            </Content>
        </Dialog>
    </DialogTrigger>
}
