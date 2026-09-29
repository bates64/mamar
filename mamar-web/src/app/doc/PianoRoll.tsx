import { type Bgm, type Track } from "pm64-typegen"
import { useEffect, useRef } from "react"

import Bridge from "../bridge"
import { useBgm, useLocation } from "../store"
import { alternatePartOf } from "../store/bgm"
import { useSize } from "../util/hooks/useSize"

export interface Props {
    trackListId: number
    trackIndex: number
}

export default function PianoRoll({ trackListId, trackIndex }: Props) {
    const [bgm] = useBgm()
    const [location] = useLocation()
    const trackList = bgm?.track_lists[trackListId]
    const track = trackList?.tracks[trackIndex]

    if (!bgm || !trackList || !track) return null

    // The track's other version: the track an alternate part is for, or a track's alternate part
    const otherIndex = track.alternate_for ?? alternatePartOf(trackList, trackIndex)
    const behind = otherIndex !== undefined ? trackList.tracks[otherIndex] : null

    return <Canvas track={track} branches={bgm.branches} mix={location.mix} behind={behind} />
}

function Canvas({ track, branches, mix, behind }: {
    track: Track
    branches: Bgm["branches"]
    mix: number
    behind: Track | null
}) {
    const canvas = useSize<HTMLCanvasElement>()
    const containerRef = useRef<HTMLDivElement | null>(null)
    type Renderer = InstanceType<typeof Bridge.PianoRoll>
    const rendererRef = useRef<Renderer | null>(null)
    const rafRef = useRef<number>(0)

    // init once (after canvas exists)
    useEffect(() => {
        const el = canvas.ref.current
        if (!el) return

        const ctx = el.getContext("2d", { alpha: false })!
        const r = new Bridge.PianoRoll()
        rendererRef.current = r

        containerRef.current!.style.height = `${r.scroll_height()}px`

        let alive = true

        const resize = () => {
            const dpr = window.devicePixelRatio || 1
            const rect = el.getBoundingClientRect()
            el.width = Math.max(1, Math.floor(rect.width * dpr))
            el.height = Math.max(1, Math.floor(rect.height * dpr))
            r.set_viewport(rect.width, rect.height, dpr)
        }

        const ro = new ResizeObserver(resize)
        ro.observe(el)
        resize()

        const frame = () => {
            if (!alive) return
            rafRef.current = requestAnimationFrame(frame)
            r.render(ctx)
        }
        rafRef.current = requestAnimationFrame(frame)

        return () => {
            alive = false
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            ro.disconnect()
            rendererRef.current?.free?.()
            rendererRef.current = null
        }
    }, [canvas.ref])

    // update track when prop changes
    // TODO: happen only once
    useEffect(() => {
        const r = rendererRef.current
        if (!r) return

        r.set_track(track, branches, mix, behind)

        containerRef.current!.style.height = `${r.scroll_height()}px`

        const scrollParent = containerRef.current!.parentElement!
        scrollParent.scrollTop = r.central_scroll_y() / window.devicePixelRatio
    }, [track, branches, mix, behind])

    return <div ref={containerRef}>
        <canvas ref={canvas.ref} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
}
