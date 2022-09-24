declare module "jsx:*.svg" {
    import { ComponentType, SVGProps } from "react"

    const SVGComponent: ComponentType<SVGProps<SVGSVGElement>>
    export default SVGComponent
}

declare module "*.module.scss" {
    const styles: { [key: string]: string }
    export default styles
}
