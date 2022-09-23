CFLAGS ?= -O2

all: build/n64crc.mjs build/n64crc

build/n64crc: n64crc.c
	gcc $(CFLAGS) -o $@ $<

build/n64crc.mjs: n64crc.c
	emcc $(CFLAGS) -DEMSCRIPTEN -sEXPORTED_RUNTIME_METHODS=ccall,cwrap -o $@ $<

clean:
	rm -f build/n64crc.mjs build/n64crc
