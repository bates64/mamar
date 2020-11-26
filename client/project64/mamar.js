var SERVER_PORT = 65432

var BGM = 0x42474D20 // "BGM "
var BGM_START = 0x801DA070

var sock = new Socket()

function upload_bgm() {
    if (mem.u32[BGM_START] == BGM) {
        console.log("reading BGM...")

        var size = mem.u32[BGM_START + 4]
        console.log("size: ", size.hex())

        console.log("sending to server... (please make sure Mamar is running!)")
        var sock = new Socket()
        sock.connect({
            port: SERVER_PORT,
        }, function () {
            var block = mem.getblock(BGM_START, size)
            sock.write(block, function () {
                console.log("BGM sent OK")
            })
        })
    } else {
        console.log("no BGM is playing")
    }
}

if (mem.getstring(0xB0000020, 11) == "PAPER MARIO") {
    upload_bgm()

    events.onexec(0x8014A6C4, function () {
        upload_bgm()
    })
} else {
    console.log("this is not Paper Mario")
}
