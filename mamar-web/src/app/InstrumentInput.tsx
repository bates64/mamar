import { ActionButton, ComboBox, Content, Dialog, DialogTrigger, Flex, Form, Heading, Item, NumberField, Section } from "@adobe/react-spectrum"
import { useEffect, useState } from "react"

import styles from "./InstrumentInput.module.scss"
import * as instruments from "./instruments"
import { useBgm } from "./store"

function InstrumentComboBox({ bank, patch, onChange }: {
    bank: number
    patch: number
    onChange(partial: { bank: number, patch: number }): void
}) {
    const [inputValue, setInputValue] = useState(instruments.getName(bank, patch))

    useEffect(() => {
        setInputValue(instruments.getName(bank, patch))
    }, [bank, patch])

    return <ComboBox
        label="Instrument"
        defaultItems={instruments.categories}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSelectionChange={key => {
            if (!key) return
            const [bank, patch] = key.toString().split(",").map(n => parseInt(n))
            if (isNaN(bank) || isNaN(patch)) return
            onChange({ bank, patch })
            setInputValue(instruments.getName(bank, patch))
        }}
        onBlur={() => {
            setInputValue(instruments.getName(bank, patch))
        }}
        direction="top"
    >
        {item => (
            <Section key={item.name} items={item.instruments} title={item.name}>
                {item => <Item key={[item.bank, item.patch].join(",")}>{item.name}</Item>}
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

    const name = instrument ? instruments.getName(instrument.bank, instrument.patch) : ""

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
                    <Flex gap="size-150">
                        <InstrumentComboBox bank={instrument.bank} patch={instrument.patch} onChange={partial => dispatch({ type: "update_instrument", index, partial })} />
                        <NumberField label="Bank" value={instrument.bank} onChange={bank => dispatch({ type: "update_instrument", index, partial: { bank } })} />
                        <NumberField label="Patch" value={instrument.patch} onChange={patch => dispatch({ type: "update_instrument", index, partial: { patch } })} />
                    </Flex>
                    <Flex gap="size-150" width="size-6000">
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
