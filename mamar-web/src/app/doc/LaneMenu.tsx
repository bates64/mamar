import { ActionButton, Item, Menu, MenuTrigger, Text } from "@adobe/react-spectrum"
import { Layers } from "react-feather"

import { useDoc } from "../store"

export interface LaneOption {
    key: string
    name: string
    /** Whether the lane has commands, which shows it unless it's been hidden. */
    hasCommands: boolean
}

/** Whether the lane with `key` is shown: as chosen in a lane menu, or otherwise if it has commands. */
export function useLaneShown(): (lane: LaneOption) => boolean {
    const [doc] = useDoc()
    return lane => doc?.shownLanes?.[lane.key] ?? lane.hasCommands
}

/** Chooses which of `lanes` are shown, with a checkmark on each shown lane. Its button is only an icon if `isIconOnly`. */
export default function LaneMenu({ name, lanes, isIconOnly = false }: { name: string, lanes: LaneOption[], isIconOnly?: boolean }) {
    const [, dispatch] = useDoc()
    const isShown = useLaneShown()

    return <MenuTrigger>
        <ActionButton isQuiet aria-label={`Choose ${name.toLowerCase()}`}>
            <Layers size={14} style={{ margin: isIconOnly ? "0 8px" : "0 6px 0 10px" }} />
            {!isIconOnly && <Text>{name}</Text>}
        </ActionButton>
        <Menu
            items={lanes}
            selectionMode="multiple"
            selectedKeys={lanes.filter(isShown).map(lane => lane.key)}
            onSelectionChange={keys => {
                for (const lane of lanes) {
                    const shown = keys === "all" || keys.has(lane.key)
                    if (shown !== isShown(lane)) {
                        dispatch({ type: "set_lane_shown", lane: lane.key, shown })
                    }
                }
            }}
        >
            {lane => <Item key={lane.key}>{lane.name}</Item>}
        </Menu>
    </MenuTrigger>
}
