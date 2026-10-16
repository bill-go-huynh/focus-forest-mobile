"""Generate assets/art/grain.png: the tree scene's faint paper grain (ART.1, direction B).

react-native-svg has no feTurbulence, so the canvas's grain becomes a small tiled texture:
light and dark specks at low alpha. Deterministic (a fixed linear congruential generator), so
regenerating gives the same bytes. Python standard library only.

Run from the repo root: python3 design/tools/generate-grain.py
"""

import struct
import zlib

SIZE = 96
MAX_ALPHA = 34


def lcg(seed):
    state = seed
    while True:
        state = (state * 1103515245 + 12345) & 0x7FFFFFFF
        yield state


def chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def main():
    rand = lcg(20261016)
    rows = bytearray()
    for _ in range(SIZE):
        rows.append(0)  # filter: none
        for _ in range(SIZE):
            value = next(rand)
            light = (value >> 8) & 1
            alpha = (value >> 12) % (MAX_ALPHA + 1)
            shade = 255 if light else 34
            rows.extend((shade, shade, shade, alpha))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    png += chunk(b"IEND", b"")
    with open("assets/art/grain.png", "wb") as out:
        out.write(png)


if __name__ == "__main__":
    main()
