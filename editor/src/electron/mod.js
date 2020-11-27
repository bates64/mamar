export function is_electron() {
    return !!(window.process && window.process.versions.electron)
}

export function server_listen(callback) {
    const net = window.require("net")

    const connections = []

    const server = net.createServer(sock => {
        connections.push(sock)

        sock.setKeepAlive(true)

        sock.on("data", callback)

        sock.on("error", console.error)

        sock.on("close", () => console.error("lost connection to emulator"))
    })

    server.listen(65432)

    return {
        server,
        connections,
    }
}

export function server_send({ connections }, data) {
    for (const sock of connections) {
        sock.write(data)
    }
}
