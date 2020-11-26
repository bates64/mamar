export function is_electron() {
    return !!(window.process && window.process.versions.electron)
}

let server

export function server_listen(callback) {
    const net = window.require("net")

    server = net.createServer(sock => {
        sock.on("data", data => {
            console.log(data)
            callback(data)
        })

        sock.on("error", console.error)

        sock.on("close", () => console.log("server died"))
    })

    server.listen(65432)
}
