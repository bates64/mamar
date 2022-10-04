import { createContainer } from "react-tracked"
import useUndoable from "use-undoable"

import { Root, RootAction, rootReducer } from "./root"

interface Dispatch {
    (action: RootAction): void
    undo: () => void
    redo: () => void
    canUndo: boolean
    canRedo: boolean
}

function shouldActionCommitToHistory(action: RootAction): boolean {
    switch (action.type) {
    case "doc":
        switch (action.action.type) {
        case "bgm":
            return true
        }
    }
    return false
}

interface Action {
    type: string
    action?: Action
}

function joinActionTypes(action: Action): string {
    if (action.action) {
        return `${action.type}/${joinActionTypes(action.action)}`
    } else {
        return action.type
    }
}

const {
    Provider,
    useTracked,
} = createContainer(() => {
    const [state, setState, { undo, redo, canUndo, canRedo }] = useUndoable<Root>({
        docs: {},
    }, {
        behavior: "destroyFuture", // "mergePastReversed",
        historyLimit: 100,
    })

    const dispatch: Dispatch = action => {
        console.info("dispatch", joinActionTypes(action), action)
        setState(
            prevState => {
                const newState = rootReducer(prevState, action)
                console.log("new state", newState)
                return newState
            },
            undefined,
            !shouldActionCommitToHistory(action),
        )
    }
    dispatch.undo = undo
    dispatch.redo = redo
    dispatch.canUndo = canUndo
    dispatch.canRedo = canRedo

    return [state, dispatch]
})

export const RootProvider = Provider

export const useRoot: () => [Root, Dispatch] = useTracked as any
