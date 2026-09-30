import { useCallback, useEffect, useRef } from "react"

import styles from "./TrackMeter.module.scss"

import useSongPlayer, { PlayerStatus } from "../emu/SongPlayer"

/** The quietest level a meter shows, at its bottom, in dB below the loudest sample the engine can play. */
const FLOOR_DB = -60

/**
 * Levels, in dB, and how far up the meter each is, between which the meter is linear in dB. A track plays well below
 * the loudest sample, as the mix leaves room for every track together, so the levels above -30 dB take most of it.
 */
const SCALE: [number, number][] = [[FLOOR_DB, 0], [-30, 0.25], [-12, 0.7], [0, 1]]

/** How quickly a meter falls once its track gets quieter, in dB per second. */
const FALL_RATE = 30

/** How long the line marking a meter's recent peak stays before it falls, in ms. */
const PEAK_HOLD = 1000

function decibels(level: number): number {
    return level > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(level)) : FLOOR_DB
}

/** How far up the meter `db` is, from 0 at its bottom to 1 at its top. */
function height(db: number): number {
    for (let i = 1; i < SCALE.length; i++) {
        const [fromDb, from] = SCALE[i - 1]
        const [toDb, to] = SCALE[i]
        if (db <= toDb) {
            return from + (Math.max(db, fromDb) - fromDb) / (toDb - fromDb) * (to - from)
        }
    }
    return 1
}

/** A channel's level as shown: the bar, which falls smoothly, and the recent peak, which holds a while first. */
interface Channel {
    shown: number
    peak: number
    peakAt: number
}

/**
 * A stereo meter of how loud track `trackIndex` plays, as its left and right channels, like a mixing desk's. Each
 * shows the loudest samples the track's notes add to the output, after their volume and pan, as they're heard.
 */
export default function TrackMeter({ trackIndex }: { trackIndex: number }) {
    const bars = useRef<(HTMLDivElement | null)[]>([])
    const peaks = useRef<(HTMLDivElement | null)[]>([])
    const channels = useRef<Channel[]>([0, 1].map(() => ({ shown: FLOOR_DB, peak: FLOOR_DB, peakAt: 0 })))
    // Levels to show when they're heard, with the time they are, in performance.now() time
    const pending = useRef<{ at: number, levels: [number, number] }[]>([])
    const frame = useRef(0)
    const last = useRef(0)

    // Drawn outside React, as the meter changes every frame
    const draw = useCallback((now: number) => {
        const dt = last.current ? (now - last.current) / 1000 : 0
        last.current = now
        const heard = pending.current.filter(({ at }) => at <= now)
        pending.current = pending.current.filter(({ at }) => at > now)

        let isActive = pending.current.length > 0
        channels.current.forEach((channel, i) => {
            const level = Math.max(FLOOR_DB, ...heard.map(({ levels }) => decibels(levels[i])))
            channel.shown = Math.max(level, channel.shown - FALL_RATE * dt)
            if (level >= channel.peak) {
                channel.peak = level
                channel.peakAt = now
            } else if (now - channel.peakAt > PEAK_HOLD) {
                channel.peak = Math.max(channel.shown, channel.peak - FALL_RATE * dt)
            }
            const bar = bars.current[i]
            const peak = peaks.current[i]
            if (bar) bar.style.clipPath = `inset(${(1 - height(channel.shown)) * 100}% 0 0 0)`
            if (peak) {
                peak.style.bottom = `${height(channel.peak) * 100}%`
                peak.style.opacity = channel.peak > FLOOR_DB ? "1" : "0"
            }
            isActive ||= channel.shown > FLOOR_DB || channel.peak > FLOOR_DB
        })

        frame.current = isActive ? requestAnimationFrame(draw) : 0
        if (!isActive) last.current = 0
    }, [])

    useSongPlayer(useCallback((status: PlayerStatus) => {
        const left = status.levels[trackIndex * 2] ?? 0
        const right = status.levels[trackIndex * 2 + 1] ?? 0
        pending.current.push({ at: performance.now() + status.latency, levels: [left, right] })
        if (!frame.current) {
            frame.current = requestAnimationFrame(draw)
        }
    }, [trackIndex, draw]))

    useEffect(() => () => cancelAnimationFrame(frame.current), [])

    return <div className={styles.meter} aria-hidden="true">
        {[0, 1].map(i => <div key={i} className={styles.channel}>
            <div ref={el => {
                bars.current[i] = el
            }} className={styles.level} />
            <div ref={el => {
                peaks.current[i] = el
            }} className={styles.peak} />
        </div>)}
    </div>
}
