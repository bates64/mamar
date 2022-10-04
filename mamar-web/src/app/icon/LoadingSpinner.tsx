const src = new URL("./loadingspinner.svg", import.meta.url).href

export default function LoadingSpinner() {
    return <img src={src} alt="" className="icon" />
}
