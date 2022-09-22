import { Sbn } from "pm64-typegen"
import { useEffect, useState } from "react"

export default function useDecodedSbn(romData: ArrayBuffer): Sbn | null {
    const [decodedSbn, setDecodedSbn] = useState<Sbn | Error | null>(null)

    useEffect(() => {
        const worker = new Worker(new URL("./worker.ts", import.meta.url), {
            type: "module",
        })

        new Promise<Sbn | Error>(resolve => {
            worker.addEventListener("message", evt => {
                const data = evt.data as Sbn | string

                if (data === "READY") {
                    worker.postMessage(romData)
                } else if (typeof data === "string") {
                    resolve(new Error(data))
                } else {
                    resolve(data)
                }
            })
        }).then(sbn => {
            setDecodedSbn(sbn)
        })
    }, [romData])

    if (decodedSbn instanceof Error) {
        throw decodedSbn
    }

    return decodedSbn
}
