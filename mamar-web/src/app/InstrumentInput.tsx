import { ActionButton, ComboBox, Content, Dialog, DialogTrigger, Flex, Form, Heading, Item, NumberField, Section } from "@adobe/react-spectrum"
import { PatchAddress } from "pm64-typegen"
import { useEffect, useState } from "react"

import styles from "./InstrumentInput.module.scss"
import * as instruments from "./instruments"
import { useBgm } from "./store"

function PatchComboBox({ patch, onChange }: {
    patch: PatchAddress
    onChange(patch: PatchAddress): void
}) {
    const [inputValue, setInputValue] = useState(instruments.getName(patch))

    useEffect(() => {
        setInputValue(instruments.getName(patch))
    }, [patch])

    return <ComboBox
        label="Sound"
        defaultItems={instruments.categories}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSelectionChange={key => {
            if (!key) return
            const [bank, instrument] = key.toString().split(",").map(n => parseInt(n))
            if (isNaN(bank) || isNaN(instrument)) return

            const newPatch: PatchAddress = {
                ...patch,
                bank_set: "Music",
                bank,
                instrument,
            }
            onChange(newPatch)
            setInputValue(instruments.getName(newPatch))
        }}
        onBlur={() => {
            setInputValue(instruments.getName(patch))
        }}
        direction="top"
    >
        {item => (
            <Section key={item.name} items={item.instruments.filter(i => i.visible !== false)} title={item.name}>
                {item => <Item key={[item.bank, item.instrument].join(",")}>{item.name}</Item>}
            </Section>
        )}
    </ComboBox>
}

export interface Props {
    index: number
    onChange(index: number): void
}

export default function InstrumentInput({ index, onChange }: Props) {
    const [bgm, dispatch] = useBgm()
    const instrument = bgm?.instruments[index]

    const name = instrument ? instruments.getName(instrument.patch) : ""

    return <DialogTrigger type="popover" placement="right">
        <ActionButton UNSAFE_className={styles.actionButton}>
            #{index} {name ? `(${name})` : ""}
        </ActionButton>
        <Dialog minWidth="500px">
            <Heading>
                <Flex justifyContent="space-between">
                    <span>Part {index}</span>

                    {bgm && <NumberField
                        aria-label="Part index"
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
                    <Flex gap="size-150">
                        <PatchComboBox patch={instrument.patch} onChange={patch => dispatch({ type: "update_instrument", index, partial: { patch } })} />
                        <NumberField label="Envelope" value={instrument.patch.envelope} minValue={0} maxValue={3} onChange={envelope => dispatch({ type: "update_instrument", index, partial: { patch: { ...instrument.patch, envelope } } })} />
                    </Flex>
                    <Flex gap="size-150">
                        <NumberField label="Volume" value={instrument.volume} onChange={volume => dispatch({ type: "update_instrument", index, partial: { volume } })} />
                        <NumberField label="Pan" value={instrument.pan} onChange={pan => dispatch({ type: "update_instrument", index, partial: { pan } })} />
                        <NumberField label="Reverb" value={instrument.reverb} onChange={reverb => dispatch({ type: "update_instrument", index, partial: { reverb } })} />
                    </Flex>
                    <Flex gap="size-150">
                        <NumberField label="Coarse tune" value={instrument.coarse_tune} onChange={coarse_tune => dispatch({ type: "update_instrument", index, partial: { coarse_tune } })} />
                        <NumberField label="Fine tune" value={instrument.fine_tune} onChange={fine_tune => dispatch({ type: "update_instrument", index, partial: { fine_tune } })} />
                    </Flex>
                </Form>}
            </Content>
        </Dialog>
    </DialogTrigger>
}

// Same as InstrumentInput but operates on a PatchAddress instead of an entire instrument
export function PatchInput({ patch, onChange }: { patch: PatchAddress, onChange: (patch: PatchAddress) => void }) {
    const name = instruments.getName(patch)
    return <DialogTrigger type="popover" placement="right">
        <ActionButton UNSAFE_className={styles.actionButton}>
            {name}
        </ActionButton>
        <Dialog minWidth="500px">
            <Content>
                <Form isQuiet onSubmit={e => e.preventDefault()}>
                    <Flex gap="size-150">
                        <PatchComboBox patch={patch} onChange={patch => onChange(patch)} />
                        <NumberField label="Envelope" value={patch.envelope} minValue={0} maxValue={3} onChange={envelope => onChange({ ...patch, envelope })} />
                    </Flex>
                </Form>
            </Content>
        </Dialog>
    </DialogTrigger>
}
