import { Reducer, Dispatch, ReducerAction, useReducer } from "react"

interface Action {
    type: string
}

interface State<S> {
    past: S[]
    present: S
    future: S[]
}

export const undo = { type: "undo" }
export const redo = { type: "redo" }

export default function useUndoReducer<S, R extends Reducer<S, Action>>(
    reducer: R,
    initialState: () => S,
): [State<S>, Dispatch<ReducerAction<R>>] {
    const undoReducer = (state: State<S>, action: Action) => {
        const newPresent = reducer(state.present, action)

        if (action.type === "undo") {
            const [newPresent, ...past] = state.past
            return {
                past,
                present: newPresent,
                future: [state.present, ...state.future],
            }
        }
        if (action.type === "redo") {
            const [newPresent, ...future] = state.future
            return {
                past: [state.present, ...state.past],
                present: newPresent,
                future,
            }
        }
        return {
            past: [state.present, ...state.past],
            present: newPresent,
            future: [],
        }
    }

    return useReducer(undoReducer, undefined, () => {
        return {
            past: [],
            present: typeof initialState === "function" ? initialState() : initialState,
            future: [],
        }
    })
}
