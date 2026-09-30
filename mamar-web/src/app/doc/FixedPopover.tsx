import { ReactNode, useEffect, useRef } from "react"

import styles from "./FixedPopover.module.scss"

/** Space kept for the popup below its anchor before it opens above instead. */
const EXPECTED_HEIGHT = 320

/**
 * A popup beside `anchor`, the element that opened it. It's fixed in place, so lanes that clip their contents don't
 * clip it, and it closes on a press elsewhere in the app or on Escape.
 */
export default function FixedPopover({ anchor, onClose, children }: { anchor: DOMRect, onClose(): void, children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null)
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose

    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            // Spectrum's popups, such as a combo box's list, open outside the app's root, so pressing in one isn't outside
            const target = event.target as Element
            if (!ref.current?.contains(target) && target.closest?.("#root")) {
                onCloseRef.current()
            }
        }
        const onKeyDown = (event: KeyboardEvent) => {
            // Escape in an open Spectrum popup, or in a combo box whose list is open, closes only that
            const target = event.target
            const isInPopup = target instanceof Element && target !== document.body && !target.closest("#root")
            const isListOpen = target instanceof Element && target.getAttribute("aria-expanded") === "true"
            if (event.key === "Escape" && !isInPopup && !isListOpen) {
                onCloseRef.current()
            }
        }
        // Start listening once the press that opened the popup is over
        const timer = setTimeout(() => {
            document.addEventListener("pointerdown", onPointerDown, true)
            document.addEventListener("keydown", onKeyDown)
        })
        return () => {
            clearTimeout(timer)
            document.removeEventListener("pointerdown", onPointerDown, true)
            document.removeEventListener("keydown", onKeyDown)
        }
    }, [])

    const below = anchor.bottom + EXPECTED_HEIGHT < window.innerHeight
    return <div
        ref={ref}
        className={styles.popover}
        role="dialog"
        style={below
            // As tall as its contents, up to the room on that side of the anchor
            ? { top: anchor.bottom + 4, left: anchor.left, maxHeight: Math.max(EXPECTED_HEIGHT, window.innerHeight - anchor.bottom - 12) }
            : { bottom: window.innerHeight - anchor.top + 4, left: anchor.left, maxHeight: anchor.top - 12 }}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
    >
        {children}
    </div>
}

/** A list of choices, with the current one checked. */
export function ChoiceList({ label, choices, value, onChoose }: {
    label: string
    choices: { value: number, name: string }[]
    value?: number
    onChoose(value: number): void
}) {
    return <div role="listbox" aria-label={label} className={styles.choices}>
        {choices.map(choice => <button
            key={choice.value}
            role="option"
            aria-selected={choice.value === value}
            className={styles.choice}
            autoFocus={choice.value === value}
            onClick={() => onChoose(choice.value)}
        >
            <span className={styles.check} aria-hidden="true">{choice.value === value ? "✓" : ""}</span>
            {choice.name}
        </button>)}
    </div>
}

/** An action in a {@link MenuList}, with the keys that also do it, or a line between groups of actions. */
export type MenuItem = { label: string, shortcut?: string, isDisabled?: boolean, onAction(): void } | "separator"

/** A list of actions, such as a context menu's. */
export function MenuList({ label, items, onClose }: { label: string, items: MenuItem[], onClose(): void }) {
    return <div role="menu" aria-label={label} className={styles.choices}>
        {items.map((item, i) => (item === "separator"
            ? <div key={i} role="separator" className={styles.separator} />
            : <button
                key={item.label}
                role="menuitem"
                className={styles.choice}
                autoFocus={i === 0}
                disabled={item.isDisabled}
                onClick={() => {
                    item.onAction()
                    onClose()
                }}
            >
                <span className={styles.menuLabel}>{item.label}</span>
                {item.shortcut && <kbd className={styles.shortcut}>{item.shortcut}</kbd>}
            </button>))}
    </div>
}
