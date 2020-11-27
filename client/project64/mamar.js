var SERVER_PORT = 65432

var BGM = 0x42474D20 // "BGM "
var BGM_START = 0x801DA070

var BATTLE_BGM_START = 0xB0FA3C60 // TODO: better to load to ram, writing to rom is slow
var BATTLE_BGM_ID = 0x90

var sock

function connect() {
    sock = new Socket()

    sock.connect({
        port: SERVER_PORT,
    }, function () {
        console.log("connected to server OK")
        upload_bgm()
    })

    var write_pos
    sock.on("data", function (data) {
        console.log("recieve data size", data.length.hex())

        data = new Uint8Array(data)

        // "BGM"
        if (data[0] == 0x42 && data[1] == 0x47 && data[2] == 0x4D && data[3] == 0x20) {
            write_pos = BATTLE_BGM_START
            console.log("loading BGM sent from server...")
        }

        // Write the data!
        for (var i = 0; i < data.length; i++) {
            mem.u8[write_pos++] = data[i]
        }

        if (data.length < 0x800) {
            console.log("finished recieve. playing new BGM")

            // gMusicPlayers[0]
            mem.u16[0x80159AF2] = 1 // fadeState = fade out
            mem.u32[0x80159AF4] = 0 // fadeOutTime
            mem.u32[0x80159AF8] = 0 // fadeInTime
            mem.u32[0x80159B00] = BATTLE_BGM_ID // new song ID
        }
    })

    sock.on("close", function () {
        console.log("lost connection to server :(")
        connect()
    })
}

function upload_bgm() {
    if (mem.u32[BGM_START] == BGM) {
        console.log("reading BGM...")

        var size = mem.u32[BGM_START + 4]
        console.log("size: ", size.hex())

        console.log("sending to server...")
        var block = mem.getblock(BGM_START, size)
        sock.write(block, function () {
            console.log("BGM sent OK")
        })
    } else {
        console.log("no BGM is playing")
    }
}

if (mem.getstring(0xB0000020, 11) == "PAPER MARIO") {
    connect()

    // BGM load hook
    events.onexec(0x8014A6C4, function () {
        upload_bgm()
    })
} else {
    console.log("this is not Paper Mario")
}
