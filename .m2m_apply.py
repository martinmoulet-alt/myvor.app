from pathlib import Path
import base64,zlib,json,hashlib,sys

ROOT=Path("myvor-v1")
data="".join(Path(f".m2m.data.{i:02d}").read_text() for i in range(3))
payload=json.loads(zlib.decompress(base64.b85decode(data.encode())).decode())
for rel,ops in payload["ops"].items():
    p=ROOT/rel
    text=p.read_text() if p.exists() else ""
    for start,end,old,new in reversed(ops):
        actual=text[start:end]
        if actual!=old:
            print(f"MISMATCH {rel}:{start}:{end}",file=sys.stderr)
            print("expected:",repr(old),file=sys.stderr)
            print("actual:",repr(actual),file=sys.stderr)
            raise SystemExit(2)
        text=text[:start]+new+text[end:]
    digest=hashlib.sha256(text.encode()).hexdigest()
    expected=payload["hashes"][rel]
    if digest!=expected:
        raise SystemExit(f"HASH MISMATCH {rel}: {digest} != {expected}")
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)
    print(f"OK {rel} {digest}")
