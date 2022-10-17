import { manifest, version } from "@parcel/service-worker"

async function install() {
    const cache = await caches.open(version)
    await cache.addAll(Array.from(new Set(manifest)))
}
addEventListener("install", evt => evt.waitUntil(install()))

async function activate() {
    const keys = await caches.keys()
    await Promise.all(
        keys.map(key => key !== version && caches.delete(key)),
    )
}
addEventListener("activate", evt => evt.waitUntil(activate()))

addEventListener("fetch", evt => {
    evt.respondWith((async () => {
        const r = await caches.match(evt.request)
        if (r) {
            console.log("[service worker] Cache hit", evt.request.url)
            return r
        }

        console.error("[service worker] Cache miss", evt.request.url)

        const response = await fetch(evt.request)
        const cache = await caches.open(version)
        console.log(`[service worker] Caching new resource: ${evt.request.url}`)
        cache.put(evt.request, response.clone())
        return response
    })())
})
