#!/usr/bin/env node
const { spawn } = require("child_process")
const chokidar = require("chokidar")
const path = require("path")

const crateDir = path.resolve(__dirname, "..", "..", "mamar-wasm-bridge")
const wasmSrcDir = path.join(crateDir, "src")

const pm64Dir = path.join(__dirname, "..", "..", "pm64")
const pm64SrcDir = path.join(pm64Dir, "src")

const typegenDir = path.resolve(__dirname, "..", "..", "pm64-typegen")
const typegenSrcDir = path.join(typegenDir, "src")

const mode = process.argv[2] === "build" ? "build" : "watch"

let wasmBuilding = false
let wasmQueued = false

let typegenBuilding = false
let typegenQueued = false

const runWasmBuild = (reason = "change") => {
    if (wasmBuilding) {
        wasmQueued = true
        return
    }

    const flags = mode === "build" ? [] : ["--dev"]

    wasmBuilding = true
    const cmd = spawn("wasm-pack", ["build", "-t", "web", "--out-dir", "pkg", ...flags, "--color=always"], {
        cwd: crateDir,
        stdio: "inherit",
    })

    cmd.on("close", code => {
        wasmBuilding = false
        if (wasmQueued) {
            wasmQueued = false
            runWasmBuild("queued")
        } else if (code !== 0) {
            console.error(`[wasm-pack] build failed (exit ${code}) after ${reason}`)
        }
    })
}

const runTypegenBuild = (reason = "change") => {
    if (typegenBuilding) {
        typegenQueued = true
        return
    }

    typegenBuilding = true
    const cmd = spawn("yarn", ["build"], {
        cwd: typegenDir,
        stdio: "inherit",
    })

    cmd.on("close", code => {
        typegenBuilding = false
        if (typegenQueued) {
            typegenQueued = false
            runTypegenBuild("queued")
        } else if (code !== 0) {
            console.error(`[pm64-typegen] build failed (exit ${code}) after ${reason}`)
        }
    })
}

runWasmBuild("startup")
runTypegenBuild("startup")

if (mode !== "build") {
    chokidar
        .watch([wasmSrcDir, pm64SrcDir], { ignoreInitial: true })
        .on("all", (_event, filePath) => {
            runWasmBuild(filePath)
        })

    chokidar
        .watch([typegenSrcDir, pm64SrcDir], { ignoreInitial: true })
        .on("all", (_event, filePath) => {
            runTypegenBuild(filePath)
        })
} else {
    const maybeExit = setInterval(() => {
        if (!wasmBuilding && !wasmQueued && !typegenBuilding && !typegenQueued) {
            clearInterval(maybeExit)
            process.exit(0)
        }
    }, 200)
}
