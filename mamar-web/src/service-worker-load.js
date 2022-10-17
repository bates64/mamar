navigator.serviceWorker
    .register(new URL("./service-worker.js", import.meta.url), { type: "module" })
    .then(registration => {
        return registration.update()
    })
