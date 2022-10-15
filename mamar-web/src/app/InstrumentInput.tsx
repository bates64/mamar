import { ActionButton, Content, Dialog, DialogTrigger, Flex, Form, Heading, NumberField } from "@adobe/react-spectrum"

import styles from "./InstrumentInput.module.scss"
import { useBgm } from "./store"

export interface Props {
    index: number
    onChange(index: number): void
}

export default function InstrumentInput({ index, onChange }: Props) {
    const [bgm, dispatch] = useBgm()
    const instrument = bgm?.instruments[index]

    return <DialogTrigger type="popover" placement="right">
        <ActionButton UNSAFE_className={styles.actionButton}>
            #{index}
        </ActionButton>
        <Dialog minWidth="500px">
            <Heading>
                <Flex justifyContent="space-between">
                    <span>Instrument {index}</span>

                    {bgm && <NumberField
                        value={index}
                        onChange={onChange}
                        minValue={0}
                        maxValue={bgm.instruments.length - 1}
                        step={1}
                    />}
                </Flex>
            </Heading>
            <Content>
                {instrument && <Form isQuiet>
                    <Flex gap="size-150">
                        {/* TODO: combobox with named instruments */}
                        <NumberField label="Bank" value={instrument.bank} onChange={bank => dispatch({ type: "update_instrument", index, partial: { bank } })} />
                        <NumberField label="Patch" value={instrument.patch} onChange={patch => dispatch({ type: "update_instrument", index, partial: { patch } })} />
                    </Flex>
                    <Flex gap="size-150" width="size-6000">
                        <NumberField label="Volume" value={instrument.volume} onChange={volume => dispatch({ type: "update_instrument", index, partial: { volume } })} />
                        <NumberField label="Pan" value={instrument.pan} onChange={pan => dispatch({ type: "update_instrument", index, partial: { pan } })} />
                        <NumberField label="Reverb" value={instrument.reverb} onChange={reverb => dispatch({ type: "update_instrument", index, partial: { reverb } })} />
                    </Flex>
                    <Flex gap="size-150">
                        <NumberField label="Coarse tune" value={instrument.coarseTune} onChange={coarseTune => dispatch({ type: "update_instrument", index, partial: { coarseTune } })} />
                        <NumberField label="Fine tune" value={instrument.fineTune} onChange={fineTune => dispatch({ type: "update_instrument", index, partial: { fineTune } })} />
                    </Flex>
                </Form>}
            </Content>
        </Dialog>
    </DialogTrigger>
}
