import { useBgm } from "./store"

export default function TempBridgeTest() {
    const [bgm, dispatch] = useBgm()

    if (!bgm) {
        return <div>No document open</div>
    }

    return <div>
        <p>
            Voice count: {bgm.voices.length}
        </p>
        <button onClick={() => dispatch({ type: "add_voice" })}>
            Add voice
        </button>
    </div>
}
