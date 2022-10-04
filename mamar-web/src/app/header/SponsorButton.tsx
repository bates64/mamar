import { Heart } from "react-feather"

import styles from "./SponsorButton.module.scss"

export default function SponsorButton() {
    return <a
        href="https://github.com/sponsors/nanaian"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.button}
    >
        <Heart size={18} />
        <span>Support development</span>
    </a>
}
