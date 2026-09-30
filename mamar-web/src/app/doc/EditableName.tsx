import classNames from "classnames"
import { useLayoutEffect, useRef, useState } from "react"
import { Edit2, Trash2 } from "react-feather"

import styles from "./EditableName.module.scss"

/**
 * A name, with buttons to rename and delete what it names on hover, for those that can be. Renaming edits the name in
 * place, in the same box, so nothing around it moves. Shows `placeholder` for an empty name.
 */
export default function EditableName({ id, name, placeholder, label, className, nameClassName, onRename, onDelete }: {
    id?: string
    name: string
    placeholder?: string
    /** What the name is of, such as "Mix", for its buttons. */
    label: string
    className?: string
    nameClassName?: string
    onRename?(name: string): void
    onDelete?(): void
}) {
    const [isRenaming, setIsRenaming] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const shown = name || placeholder || ""

    // Starts renaming with the whole name selected, so typing replaces it
    useLayoutEffect(() => {
        const el = ref.current
        if (!isRenaming || !el) return
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
    }, [isRenaming])

    return <div className={classNames(styles.head, className)}>
        <div
            // A new element for renaming, as editing changes its text without React
            key={isRenaming ? "renaming" : "name"}
            ref={ref}
            id={id}
            className={classNames(styles.name, nameClassName, { [styles.placeholder]: !name && !isRenaming, [styles.renaming]: isRenaming })}
            // Plain text only, so pasting doesn't bring formatting in
            {...(isRenaming ? { contentEditable: "plaintext-only" as unknown as boolean } : {})}
            suppressContentEditableWarning
            role={isRenaming ? "textbox" : undefined}
            aria-label={isRenaming ? `${label} name` : undefined}
            onClick={event => isRenaming && event.stopPropagation()}
            onBlur={event => {
                if (!isRenaming) return
                const renamed = event.currentTarget.textContent ?? ""
                setIsRenaming(false)
                if (renamed !== name) {
                    onRename?.(renamed)
                }
            }}
            onKeyDown={event => {
                if (!isRenaming) return
                if (event.key === "Enter") {
                    event.preventDefault()
                    event.currentTarget.blur()
                } else if (event.key === "Escape") {
                    event.currentTarget.textContent = name
                    event.currentTarget.blur()
                }
            }}
        >
            {isRenaming ? name : shown}
        </div>
        {onRename && !isRenaming && <button
            className={styles.action}
            aria-label={`Rename ${shown}`}
            onClick={event => {
                event.stopPropagation()
                setIsRenaming(true)
            }}
        >
            <Edit2 size={12} />
        </button>}
        {onDelete && !isRenaming && <button
            className={styles.action}
            aria-label={`Delete ${shown}`}
            onClick={event => {
                event.stopPropagation()
                onDelete()
            }}
        >
            <Trash2 size={12} />
        </button>}
    </div>
}
