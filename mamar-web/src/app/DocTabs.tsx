import { Flex } from "@adobe/react-spectrum"
import CircleFilled from "@spectrum-icons/workflow/CircleFilled"
import Close from "@spectrum-icons/workflow/Close"

import ActiveDoc from "./doc/ActiveDoc"
import ErrorBoundaryView from "./ErrorBoundaryView"
import { Doc, useRoot } from "./store"

import "./DocTabs.scss"

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
        <span title={name}>{name}</span>
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
