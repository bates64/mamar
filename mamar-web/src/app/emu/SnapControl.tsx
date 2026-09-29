import { ActionButton, Item, Menu, MenuTrigger, Tooltip, TooltipTrigger } from "@adobe/react-spectrum"
import { ZoomIn, ZoomOut } from "react-feather"

import styles from "./PlaybackControls.module.scss"

import { SNAP_NAMES, useSnap } from "../doc/snap"
import { zoomTimeline } from "../doc/TimeProvider"
import { useDoc } from "../store"
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, Snap } from "../store/doc"

/** How much each press of a zoom button zooms by. */
const BUTTON_ZOOM_STEP = 1.5

/** Zooms the timeline in and out. */
export function ZoomControls() {
    const [doc, dispatch] = useDoc()
    const zoom = doc?.zoom ?? DEFAULT_ZOOM

    return <div className={styles.zoom} role="group" aria-label="Zoom">
        <TooltipTrigger>
            <ActionButton aria-label="Zoom out" isDisabled={zoom >= MAX_ZOOM} onPress={() => zoomTimeline(dispatch, zoom, zoom * BUTTON_ZOOM_STEP)}>
                <ZoomOut size={16} />
            </ActionButton>
            <Tooltip>Zoom out (Ctrl or Cmd with the mouse wheel)</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger>
            <ActionButton aria-label="Zoom in" isDisabled={zoom <= MIN_ZOOM} onPress={() => zoomTimeline(dispatch, zoom, zoom / BUTTON_ZOOM_STEP)}>
                <ZoomIn size={16} />
            </ActionButton>
            <Tooltip>Zoom in (Ctrl or Cmd with the mouse wheel)</Tooltip>
        </TooltipTrigger>
    </div>
}

/** Chooses the grid that points placed on the timeline snap to. */
export default function SnapControl() {
    const [, dispatch] = useDoc()
    const [snap] = useSnap()

    return <MenuTrigger>
        <TooltipTrigger>
            <ActionButton aria-label={`Snap to grid: ${SNAP_NAMES[snap]}`} UNSAFE_className={styles.snap}>
                <span className={styles.snapIcon} aria-hidden="true">Q</span>
                <span>{SNAP_NAMES[snap]}</span>
            </ActionButton>
            <Tooltip>Snap to grid. Hold Shift while placing to place freely.</Tooltip>
        </TooltipTrigger>
        <Menu
            selectionMode="single"
            selectedKeys={[snap]}
            onAction={key => dispatch({ type: "set_snap", snap: key as Snap })}
        >
            {(Object.keys(SNAP_NAMES) as Snap[]).map(key => <Item key={key}>{SNAP_NAMES[key]}</Item>)}
        </Menu>
    </MenuTrigger>
}
