const { Server } = require("@pmret/hot-reload")

export function server_listen(onConnect, onDisconnect) {
    const server = new Server()
    server.listen(65432)

    server.on("PING", onConnect)
    server.on(Server.DISCONNECT, onDisconnect)

    return server
}

export function num_connections(server) {
    return server.connected.filter(socket => !!socket && socket.readable && socket.writable).length
}

export function hot_bgm(server, data) {
    server.hotBgm(data)
}
