import { useEffect } from "react"

import VariationsMap from "./VariationsMap"

import { useDoc } from "../store"
import WelcomeScreen from "../WelcomeScreen"

export default function ActiveDoc() {
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

    return <VariationsMap />
}
