import { View, Flex } from "@adobe/react-spectrum"
import CircleFilled from "@spectrum-icons/workflow/CircleFilled"
import Close from "@spectrum-icons/workflow/Close"
import { useEffect } from "react"

import ErrorBoundaryView from "./ErrorBoundaryView"
import { Doc, useDoc, useRoot } from "./store"
import WelcomeScreen from "./WelcomeScreen"

import "./DocTabs.scss"

function ActiveDoc() {
    const [doc] = useDoc()

    const title = doc ? (doc.isSaved ? doc.name : `${doc.name} (unsaved)`) : "Mamar"
    useEffect(() => {
        document.title = title

        if (doc && !doc.isSaved) {
            const onbeforeunload = (evt: BeforeUnloadEvent) => {
                evt.preventDefault()
                return evt.returnValue = "You have unsaved changes."
            }
            window.addEventListener("beforeunload", onbeforeunload)
            return () => window.removeEventListener("beforeunload", onbeforeunload)
        }
    }, [title, doc])

    if (!doc) {
        return <WelcomeScreen />
    }

    return <View padding="size-200">
        Internal BGM filename: "{doc.bgm.name}"
    </View>
}

function TabButton({ doc }: { doc: Doc }) {
    const [root, dispatch] = useRoot()
    const { id, name, isSaved } = doc
    const isActive = root.activeDocId === id

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
            <Close UNSAFE_className="DocTab_Close_CloseIcon" />
            {!isSaved && <CircleFilled UNSAFE_className="DocTab_Close_UnsavedIcon" />}
        </div>
    </button>
}

export default function DocTabs() {
    const [root] = useRoot()
    const docs = Object.values(root.docs)

    return <Flex direction="column" width="100vw" height="100%">
        {docs.length >= 2 && <Flex height="size-450" UNSAFE_className="DocTabs_container">
            {docs.map(doc => <TabButton key={doc.id} doc={doc} />)}
        </Flex>}
        <ErrorBoundaryView flex UNSAFE_className="DocTabs_main_content">
            <ActiveDoc />
        </ErrorBoundaryView>
    </Flex>
}
