import { createContext, useContext } from "react"

export interface Time {
    xToTicks: (clientX: number) => number
}

const TIME_CTX = createContext<Time | null>(null)

export function useTime(): Time {
    const time = useContext(TIME_CTX)

    if (!time) {
        throw new Error("TimeProvider missing in tree")
    }

    return time
}

export const TimeProvider = TIME_CTX.Provider
