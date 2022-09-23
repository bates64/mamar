SECTIONS
{
    .text 0x80040000 : {
        ../build/patches.o(.text)
    }
}
