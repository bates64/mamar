import { ActionButton, Item, Menu, MenuTrigger, Tooltip, TooltipTrigger } from "@adobe/react-spectrum"

import styles from "./PlaybackControls.module.scss"

import { SNAP_NAMES, useSnap } from "../doc/snap"
import { useDoc } from "../store"
import { Snap } from "../store/doc"

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
