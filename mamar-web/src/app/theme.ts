import { defaultTheme } from "@adobe/react-spectrum"
import type { Theme } from "@react-types/provider"

import catppuccin from "./catppuccin.module.scss"

/** Spectrum's dark theme with Catppuccin Mocha's neutrals. Mamar has no light theme. */
export const mochaTheme: Theme = {
    ...defaultTheme,
    dark: {
        ...defaultTheme.dark,
        mocha: catppuccin.mocha,
    },
}
