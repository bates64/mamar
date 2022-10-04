SECTIONS
{
    .text 0x80400000 : {
        ../build/patches.o(.text)
    }
}
