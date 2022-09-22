import { View, Flex, DialogContainer } from "@adobe/react-spectrum"
import Close from "@spectrum-icons/workflow/Close"
import { useState } from "react"

import PaperMarioRomInputDialog, { useCachedPaperMarioUsRom } from "./emu/PaperMarioRomInputDialog"
import { useDoc, useRoot } from "./store"

import "./DocTabs.scss"
import WelcomeScreen from "./WelcomeScreen"

function ActiveDoc({ romData }: { romData: ArrayBuffer }) {
    const [doc] = useDoc()

    if (!doc) {
        return <WelcomeScreen romData={romData} />
    }

    return <View padding="size-200">
        Internal BGM filename: "{doc.bgm.name}"
    </View>
}

export default function DocTabs() {
    const [root, dispatch] = useRoot()
    const docs = Object.values(root.docs)
    const [romData, setRomData] = useState(useCachedPaperMarioUsRom())

    return <Flex direction="column" width="100vw" height="100%">
        <Flex height="size-450">
            <View minWidth="size-100" borderColor="gray-200" borderBottomWidth={1} />
            {docs.map(doc => {
                const { id } = doc
                const name = doc.name
                const isActive = root.activeDocId === doc.id

                return <button
                    key={id}
                    aria-label={name}
                    className={`DocTab active-${isActive}`}
                    onClick={() => dispatch({ type: "focus_doc", id })}
                    onAuxClick={() => dispatch({ type: "close_doc", id })}
                >
                    <span>{name}</span>
                    <div
                        aria-label="Close tab"
                        role="button"
                        tabIndex={0}
                        className="DocTab_Close"
                        onClick={evt => {
                            evt.stopPropagation()
                            dispatch({ type: "close_doc", id })
                        }}
                        onKeyDown={evt => {
                            if (evt.key === "Enter") {
                                evt.stopPropagation()
                                dispatch({ type: "close_doc", id })
                            }
                        }}
                    >
                        <Close />
                    </div>
                </button>
            })}
            <View flex minWidth="size-100" borderColor="gray-200" borderBottomWidth={1} />
        </Flex>
        <View flex backgroundColor={root.activeDocId ? "gray-100" : "gray-50"}>
            {romData && <ActiveDoc romData={romData} />}
        </View>
        <DialogContainer onDismiss={() => {}} isDismissable={false} isKeyboardDismissDisabled={true}>
            {!romData && <PaperMarioRomInputDialog onChange={setRomData} />}
        </DialogContainer>
    </Flex>
}
