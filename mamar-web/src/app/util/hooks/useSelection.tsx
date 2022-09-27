import { createContext, useState, useContext, ReactNode } from "react"

interface Selection {
    selected: number[]
    clear(): void
    select(...id: number[]): void
    multiSelect(id: number): void // toggle
    isSelected(id: number): boolean
}

const SELECTION_CTX = createContext<Selection | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
    const [selected, setSelected] = useState<number[]>([])

    return <SELECTION_CTX.Provider value={{
        selected,
        clear() {
            setSelected([])
        },
        select(...id: number[]) {
            return setSelected(id)
        },
        multiSelect(id: number) {
            setSelected(prev => [...prev, id])
        },
        isSelected(id: number) {
            return selected.includes(id)
        },
    }}>
        {children}
    </SELECTION_CTX.Provider>
}

export default function useSelection(): Selection {
    const selection = useContext(SELECTION_CTX)

    if (!selection) {
        throw new Error("SelectionProvider missing in tree")
    }

    return selection
}
