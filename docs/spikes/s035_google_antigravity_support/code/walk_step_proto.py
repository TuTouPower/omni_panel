#!/usr/bin/env python3
"""s035: walk protobuf wire fields of one antigravity step containing known text.

只读探针：输出字段号/类型/长度与文本头，不输出完整用户内容。
"""

import sqlite3

DB = (
    "/home/karon/.gemini/antigravity-cli/conversations/"
    "e997d480-53eb-42eb-a5d1-85ec7127f9d2.db"
)
NEEDLE = "按照 @docs/1.md".encode("utf-8")


def read_varint(data: bytes, pos: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        byte = data[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        shift += 7
        if not byte & 0x80:
            return result, pos


def walk_fields(data: bytes) -> list[tuple[int, str, object]]:
    fields: list[tuple[int, str, object]] = []
    pos = 0
    size = len(data)
    while pos < size:
        try:
            key, pos = read_varint(data, pos)
        except IndexError:
            break
        number = key >> 3
        wire = key & 7
        if wire == 0:
            try:
                value, pos = read_varint(data, pos)
            except IndexError:
                break
            fields.append((number, "varint", value))
        elif wire == 2:
            try:
                length, pos = read_varint(data, pos)
            except IndexError:
                break
            fields.append((number, "bytes", data[pos : pos + length]))
            pos += length
        elif wire in (1, 5):
            pos += 8 if wire == 1 else 4
            fields.append((number, "fixed", None))
        else:
            break
    return fields


def main() -> None:
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    rows = conn.execute("SELECT idx, step_type, step_payload FROM steps").fetchall()
    conn.close()
    print(f"steps: {len(rows)}")
    for idx, step_type, payload in rows:
        blob = payload if isinstance(payload, bytes) else bytes(payload)
        if NEEDLE not in blob:
            continue
        print(f"idx={idx} type={step_type} len={len(blob)}")
        for number, kind, value in walk_fields(blob):
            if kind == "varint":
                print(f"  field={number} varint={value}")
            elif kind == "bytes":
                assert isinstance(value, bytes)
                try:
                    text = value.decode("utf-8")
                    print(f"  field={number} len={len(value)} str={text[:80]!r}")
                except UnicodeDecodeError:
                    print(f"  field={number} len={len(value)} bin={value[:24].hex()}")
                    for sub_no, sub_kind, sub_val in walk_fields(value)[:12]:
                        if sub_kind == "varint":
                            print(f"    sub field={sub_no} varint={sub_val}")
                        elif sub_kind == "bytes":
                            assert isinstance(sub_val, bytes)
                            try:
                                print(
                                    f"    sub field={sub_no} len={len(sub_val)} "
                                    f"str={sub_val.decode()[:80]!r}"
                                )
                            except UnicodeDecodeError:
                                print(
                                    f"    sub field={sub_no} len={len(sub_val)} "
                                    f"bin={sub_val[:16].hex()}"
                                )
            else:
                print(f"  field={number} {kind}")
        break


if __name__ == "__main__":
    main()
