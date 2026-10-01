import {
    ActionButton, Button, ButtonGroup, Cell, Column, Content, Dialog, DialogTrigger, Divider, Flex, Footer, Heading, Row,
    TableBody, TableHeader, TableView, Text,
} from "@adobe/react-spectrum"
import Alert from "@spectrum-icons/workflow/Alert"
import { startTransition, useRef, useState } from "react"

import { TICKS_PER_BEAT, usePickup, useTicksPerBar } from "./Ruler"
import { MAX_VOICES, total, useVoiceReport } from "./voices"

import { useBgm, useRoot } from "../store"

/** Where `ticks` along the variation falls, as bar and beat, counting the pickup as bar 0, as the playhead shows it. */
function barAndBeat(ticks: number, pickup: number, ticksPerBar: number): string {
    const sinceBar1 = ticks - pickup
    const bar = Math.floor(sinceBar1 / ticksPerBar)
    const beat = Math.floor((sinceBar1 - bar * ticksPerBar) / TICKS_PER_BEAT)
    return `${bar + 1}.${beat + 1}`
}

/** A track's line in the voice budget. */
export interface BudgetRow {
    index: number
    name: string
    needs: number
    gets: number
    /** Where the track plays the most notes at once, as bar and beat, if it plays any. */
    busiestAt?: string
    shortOverlaps: number
}

/**
 * The voices the regions of a part of the song need, shown under them only when that's more than the game has, which
 * cuts notes off. Pressing it lists each track's voices and where it needs them most, with a button to trim the short
 * overlaps that make a track need a voice more.
 */
export default function VoiceBudget({ trackListId, segmentIndex, segmentStart }: {
    trackListId: number
    segmentIndex: number
    /** Where the regions start along the variation, in ticks. */
    segmentStart: number
}) {
    const [bgm, dispatch] = useBgm()
    const [root, rootDispatch] = useRoot()
    const report = useVoiceReport(trackListId)
    const pickup = usePickup()
    const ticksPerBar = useTicksPerBar()
    const trigger = useRef<HTMLDivElement>(null)
    const [isOpen, setOpen] = useState(false)

    const trackList = bgm?.track_lists[trackListId]
    if (!report || !trackList) {
        return null
    }
    const needed = total(report.voices.needed)
    // Trimming can bring the regions within budget while the list is open, which then says so
    if (needed <= MAX_VOICES && !isOpen) {
        return null
    }

    const rows: BudgetRow[] = trackList.tracks
        .map((track, index) => {
            const use = report.tracks[index]
            return {
                index,
                name: track.name || `Track ${index}`,
                needs: report.voices.needed[index],
                gets: report.voices.given[index],
                busiestAt: use.busiest_at != null ? barAndBeat(segmentStart + use.busiest_at, pickup, ticksPerBar) : undefined,
                shortOverlaps: use.short_overlaps.length,
            }
        })
        // Alternate parts use the voices of the tracks they're for, which count them
        .filter(row => row.index !== 0 && row.needs > 0 && trackList.tracks[row.index].alternate_for == null)

    // Opens the track's region where it plays the most notes at once, with those notes selected
    const open = (index: number) => {
        const id = root.activeDocId
        if (!id) return
        const use = report.tracks[index]
        startTransition(() => {
            rootDispatch(
                { type: "doc", id, action: { type: "set_panel_content", panelContent: { type: "tracker", trackList: trackListId, track: index, segment: segmentIndex } } },
                { type: "doc", id, action: { type: "set_location", location: { alternateParts: false } } },
                { type: "doc", id, action: { type: "set_selection", selection: { trackList: trackListId, track: index, events: use.busiest_notes } } },
            )
        })
        const busiestAt = use.busiest_at
        if (busiestAt == null) return
        // Once the region is open, scroll every timeline to it, as the playhead does when it follows the song
        const provider = trigger.current?.closest("[data-time-provider]")
        requestAnimationFrame(() => requestAnimationFrame(() => {
            for (const grid of provider?.querySelectorAll<HTMLElement>("[data-time-grid]") ?? []) {
                const zoom = parseFloat(getComputedStyle(grid).getPropertyValue("--ruler-zoom")) || 2
                grid.scrollLeft = Math.max(0, (segmentStart + busiestAt) / zoom - grid.clientWidth / 3)
            }
        }))
    }

    return <div ref={trigger} data-no-drag-scroll onClick={event => event.stopPropagation()}>
        <DialogTrigger type="popover" placement="bottom start" isOpen={isOpen} onOpenChange={setOpen}>
            <ActionButton margin="size-75">
                {/* Spaced by hand, as the button's own spacing doesn't reach icons, as in LaneMenu */}
                <Alert color="notice" size="S" marginStart="size-125" marginEnd="size-75" />
                <Text>{needed} / {MAX_VOICES} voices</Text>
            </ActionButton>
            {close => <VoiceBudgetDialog
                needed={needed}
                rows={rows}
                onTrim={tracks => dispatch({ type: "trim_short_overlaps", trackList: trackListId, tracks })}
                onOpenTrack={index => {
                    close()
                    open(index)
                }}
            />}
        </DialogTrigger>
    </div>
}

/** The voice budget's list of tracks, apart from the song, so it can be shown without one. */
export function VoiceBudgetDialog({ needed, rows, onTrim, onOpenTrack }: {
    needed: number
    rows: BudgetRow[]
    onTrim(tracks: number[]): void
    onOpenTrack(index: number): void
}) {
    // The tracks most likely to give up a voice cheaply first
    const sorted = [...rows].sort((a, b) =>
        Number(b.shortOverlaps > 0) - Number(a.shortOverlaps > 0) || b.needs - a.needs)
    const trimmable = sorted.filter(row => row.shortOverlaps > 0)

    return <Dialog size="L">
        <Heading>
            {needed} / {MAX_VOICES} voices{needed <= MAX_VOICES ? ": now within the budget" : ""}
        </Heading>
        <Divider />
        <Content>
            <TableView
                aria-label="Voices each track needs"
                density="compact"
                isQuiet
                // As tall as its rows, as compact rows are, with the header
                height={`calc(${sorted.length} * 33px + 36px)`}
                maxHeight="size-6000"
                onAction={key => onOpenTrack(Number(key))}
            >
                <TableHeader>
                    <Column width="2fr">Track</Column>
                    <Column width="1fr" align="end">Needs</Column>
                    <Column width="1fr" align="end">Gets</Column>
                    <Column width="1.8fr">Busiest at</Column>
                    <Column width="2.2fr">Short overlaps</Column>
                </TableHeader>
                <TableBody items={sorted}>
                    {row => <Row key={row.index}>
                        <Cell>{row.name}</Cell>
                        <Cell>{row.needs}</Cell>
                        <Cell>
                            {/* Fewer than the track needs, so it cuts notes off */}
                            {row.gets < row.needs
                                ? <Flex alignItems="center" gap="size-50" justifyContent="end">
                                    <Alert color="notice" size="S" aria-label="Fewer than it needs" />
                                    <Text>{row.gets}</Text>
                                </Flex>
                                : row.gets}
                        </Cell>
                        <Cell>{row.busiestAt ? `bar ${row.busiestAt}` : ""}</Cell>
                        <Cell>
                            {row.shortOverlaps > 0 && <Flex alignItems="center" gap="size-100">
                                <Text>{row.shortOverlaps}</Text>
                                <ActionButton isQuiet onPress={() => onTrim([row.index])}>Trim</ActionButton>
                            </Flex>}
                        </Cell>
                    </Row>}
                </TableBody>
            </TableView>
        </Content>
        <Footer>
            <Text>
                Each track reserves a voice for every note it plays at once at its busiest point, up to 4, for as long as
                these regions play. The game has {MAX_VOICES}, so tracks that get fewer than they need cut notes off.
                Choose a track to see where.
            </Text>
        </Footer>
        {trimmable.length > 1 && <ButtonGroup>
            <Button variant="secondary" onPress={() => onTrim(trimmable.map(row => row.index))}>
                Trim all short overlaps
            </Button>
        </ButtonGroup>}
    </Dialog>
}
