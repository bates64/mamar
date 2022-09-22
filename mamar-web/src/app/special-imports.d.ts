declare module "jsx:*.svg" {
    import { ComponentType, SVGProps } from "react"

    const SVGComponent: ComponentType<SVGProps<SVGSVGElement>>
    export default SVGComponent
}
