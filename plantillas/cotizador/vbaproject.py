# -*- coding: utf-8 -*-
"""Construye word/vbaProject.bin (proyecto VBA) desde codigo fuente.

El archivo es un Compound File Binary (OLE2) con los flujos que describe
[MS-OVBA]:

    /PROJECT              texto plano con la definicion del proyecto
    /PROJECTwm            mapa de nombres de modulo
    /VBA/_VBA_PROJECT     cabecera + cache de rendimiento (Word la regenera)
    /VBA/dir              catalogo del proyecto (comprimido)
    /VBA/<modulo>         codigo fuente de cada modulo (comprimido)

Los flujos comprimidos usan el algoritmo "Compressed Container" de
[MS-OVBA] 2.4.1.
"""
import os
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
VBA_DIR = os.path.join(HERE, "vba")

PROJECT_ID = "{5E9D6A1F-3C24-4F5B-9C71-2B8E4D7A6C10}"
CODEPAGE = 1252
LCID = 0x0409          # Word normaliza este valor al abrir
MODULE_STD = 0x0021    # modulo estandar (procedural)
MODULE_DOC = 0x0022    # modulo de documento / clase

FREESECT = 0xFFFFFFFF
ENDOFCHAIN = 0xFFFFFFFE
FATSECT = 0xFFFFFFFD
DIFSECT = 0xFFFFFFFC


# ==========================================================================
# Compresion [MS-OVBA] 2.4.1
# ==========================================================================
def _bitcount(d):
    n = 4
    while (1 << n) < d:
        n += 1
    return n


def _compress_chunk(src):
    """Codifica un bloque (<= 4096 bytes) como secuencia de tokens."""
    out = bytearray()
    positions = {}
    d = 0
    n = len(src)
    while d < n:
        flags = 0
        tokens = bytearray()
        for bit in range(8):
            if d >= n:
                break
            bc = _bitcount(d)
            max_len = (0xFFFF >> bc) + 3
            max_off = 1 << bc
            best_len = 0
            best_off = 0
            if d + 3 <= n:
                cands = positions.get(src[d:d + 3])
                if cands:
                    for cand in reversed(cands[-48:]):
                        off = d - cand
                        if off <= 0 or off > max_off:
                            continue
                        l = 0
                        while (l < max_len and d + l < n
                               and src[cand + l] == src[d + l]):
                            l += 1
                        if l > best_len:
                            best_len = l
                            best_off = off
                            if l >= max_len:
                                break
            if best_len >= 3:
                token = ((best_off - 1) << (16 - bc)) | (best_len - 3)
                tokens += struct.pack("<H", token)
                flags |= (1 << bit)
                adv = best_len
            else:
                tokens.append(src[d])
                adv = 1
            for i in range(d, min(d + adv, n - 2)):
                positions.setdefault(src[i:i + 3], []).append(i)
            d += adv
        out.append(flags)
        out += tokens
    return bytes(out)


def compress(data):
    out = bytearray(b"\x01")
    pos = 0
    while pos < len(data):
        src = data[pos:pos + 4096]
        comp = _compress_chunk(src)
        if len(comp) > 4096:
            raw = src + b"\x00" * (4096 - len(src))
            out += struct.pack("<H", 0x3000 | 4095) + raw
        else:
            out += struct.pack("<H", 0xB000 | (len(comp) - 1)) + comp
        pos += 4096
    return bytes(out)


def decompress(data):
    """Descompresor de referencia: sirve para verificar lo que generamos."""
    assert data[0] == 0x01, "firma de contenedor invalida"
    out = bytearray()
    pos = 1
    while pos < len(data):
        header = struct.unpack("<H", data[pos:pos + 2])[0]
        pos += 2
        size = (header & 0x0FFF) + 1
        compressed = bool(header & 0x8000)
        chunk = data[pos:pos + size]
        pos += size
        if not compressed:
            out += chunk
            continue
        start = len(out)
        i = 0
        while i < len(chunk):
            flags = chunk[i]
            i += 1
            for bit in range(8):
                if i >= len(chunk):
                    break
                if flags & (1 << bit):
                    token = struct.unpack("<H", chunk[i:i + 2])[0]
                    i += 2
                    bc = _bitcount(len(out) - start)
                    length = (token & (0xFFFF >> bc)) + 3
                    offset = (token >> (16 - bc)) + 1
                    src = len(out) - offset
                    for k in range(length):
                        out.append(out[src + k])
                else:
                    out.append(chunk[i])
                    i += 1
    return bytes(out)


# ==========================================================================
# Cifrado de CMG / DPB / GC  [MS-OVBA] 2.4.3
# ==========================================================================
def _proj_key(project_id):
    key = 0
    for b in project_id.encode("ascii"):
        key = (key + b) & 0xFF
    return key


def _encrypt(data, project_id, seed=0x0E):
    key = _proj_key(project_id)
    version = 2
    version_enc = seed ^ version
    key_enc = seed ^ key
    out = bytearray([seed, version_enc, key_enc])
    enc1, enc2, unenc1 = key_enc, version_enc, key

    def push(temp):
        nonlocal enc1, enc2, unenc1
        byte_enc = temp ^ ((enc2 + unenc1) & 0xFF)
        out.append(byte_enc)
        enc2 = enc1
        enc1 = byte_enc
        unenc1 = temp

    for i in range((seed & 6) // 2):
        push(0x00)
    for b in struct.pack("<I", len(data)):
        push(b)
    for b in data:
        push(b)
    return "".join("%02X" % b for b in out)


def _decrypt(hex_text, project_id):
    data = bytes(int(hex_text[i:i + 2], 16) for i in range(0, len(hex_text), 2))
    seed, version_enc, key_enc = data[0], data[1], data[2]
    key = seed ^ key_enc
    assert key == _proj_key(project_id), "ProjKey no coincide"
    enc1, enc2, unenc1 = key_enc, version_enc, key
    plain = bytearray()
    for byte_enc in data[3:]:
        temp = byte_enc ^ ((enc2 + unenc1) & 0xFF)
        plain.append(temp)
        enc2 = enc1
        enc1 = byte_enc
        unenc1 = temp
    ignored = (seed & 6) // 2
    plain = plain[ignored:]
    length = struct.unpack("<I", bytes(plain[:4]))[0]
    return bytes(plain[4:4 + length])


# ==========================================================================
# Flujo dir
# ==========================================================================
def _rec(rid, payload=b""):
    return struct.pack("<HI", rid, len(payload)) + payload


def _mbcs(s):
    return s.encode("cp1252", "replace")


def _uni(s):
    return s.encode("utf-16-le")


REFERENCIAS = [
    ("stdole", "*\\G{00020430-0000-0000-C000-000000000046}#2.0#0#"
               "C:\\Windows\\System32\\stdole2.tlb#OLE Automation"),
    ("Office", "*\\G{2DF8D04C-5BFA-101B-BDE5-00AA0044DE52}#2.e#0#"
               "C:\\Program Files\\Common Files\\Microsoft Shared\\OFFICE16\\MSO.DLL"
               "#Microsoft Office 16.0 Object Library"),
]


def _dir_stream(project_name, modules):
    parts = []
    # --- informacion del proyecto ---
    parts.append(_rec(0x0001, struct.pack("<I", 1)))              # SysKind Win32
    parts.append(_rec(0x0002, struct.pack("<I", LCID)))           # Lcid
    parts.append(_rec(0x0014, struct.pack("<I", LCID)))           # LcidInvoke
    parts.append(_rec(0x0003, struct.pack("<H", CODEPAGE)))       # CodePage
    parts.append(_rec(0x0004, _mbcs(project_name)))               # Name
    parts.append(struct.pack("<HI", 0x0005, 0)
                 + struct.pack("<HI", 0x0040, 0))                 # DocString
    parts.append(struct.pack("<HI", 0x0006, 0)
                 + struct.pack("<HI", 0x003D, 0))                 # HelpFile
    parts.append(_rec(0x0007, struct.pack("<I", 0)))              # HelpContext
    parts.append(_rec(0x0008, struct.pack("<I", 0)))              # LibFlags
    parts.append(struct.pack("<HI", 0x0009, 4)
                 + struct.pack("<IH", 1, 1))                      # Version
    parts.append(struct.pack("<HI", 0x000C, 0)
                 + struct.pack("<HI", 0x003C, 0))                 # Constants

    # --- referencias ---
    for nombre, libid in REFERENCIAS:
        parts.append(struct.pack("<HI", 0x0016, len(_mbcs(nombre))) + _mbcs(nombre)
                     + struct.pack("<HI", 0x003E, len(_uni(nombre))) + _uni(nombre))
        lib = _mbcs(libid)
        payload = struct.pack("<I", len(lib)) + lib + b"\x00" * 4 + b"\x00" * 2
        parts.append(_rec(0x000D, payload))

    # --- modulos ---
    parts.append(_rec(0x000F, struct.pack("<H", len(modules))))
    parts.append(_rec(0x0013, struct.pack("<H", 0xFFFF)))
    for m in modules:
        nombre = m["name"]
        parts.append(_rec(0x0019, _mbcs(nombre)))
        parts.append(_rec(0x0047, _uni(nombre)))
        parts.append(struct.pack("<HI", 0x001A, len(_mbcs(nombre))) + _mbcs(nombre)
                     + struct.pack("<HI", 0x0032, len(_uni(nombre))) + _uni(nombre))
        parts.append(struct.pack("<HI", 0x001C, 0)
                     + struct.pack("<HI", 0x0048, 0))
        parts.append(_rec(0x0031, struct.pack("<I", m["offset"])))
        parts.append(_rec(0x001E, struct.pack("<I", 0)))
        parts.append(_rec(0x002C, struct.pack("<H", 0xFFFF)))
        parts.append(_rec(m["type"]))
        parts.append(_rec(0x002B))
    parts.append(_rec(0x0010))
    return b"".join(parts)


def _project_stream(project_name, modules):
    lineas = ['ID="%s"' % PROJECT_ID]
    for m in modules:
        if m["type"] == MODULE_DOC:
            lineas.append("Document=%s/&H00000000" % m["name"])
        else:
            lineas.append("Module=%s" % m["name"])
    lineas += [
        'Name="%s"' % project_name,
        'HelpContextID="0"',
        'VersionCompatible32="393222000"',
        'CMG="%s"' % _encrypt(struct.pack("<I", 0), PROJECT_ID, 0x0A),
        'DPB="%s"' % _encrypt(b"\x00", PROJECT_ID, 0x0C),
        'GC="%s"' % _encrypt(b"\xFF", PROJECT_ID, 0x0E),
        "",
        "[Host Extender Info]",
        "&H00000001={3832D640-CF90-11CF-8E43-00A0C911005A};VBE;&H00000000",
        "",
        "[Workspace]",
    ]
    for m in modules:
        lineas.append("%s=0, 0, 0, 0, C" % m["name"])
    return ("\r\n".join(lineas) + "\r\n").encode("cp1252", "replace")


def _projectwm(modules):
    out = bytearray()
    for m in modules:
        out += _mbcs(m["name"]) + b"\x00" + _uni(m["name"]) + b"\x00\x00"
    out += b"\x00\x00"
    return bytes(out)


# ==========================================================================
# Compound File Binary
# ==========================================================================
class _Entry(object):
    def __init__(self, name, kind, data=b""):
        self.name = name
        self.kind = kind          # 1 = storage, 2 = stream, 5 = root
        self.data = data
        self.left = FREESECT
        self.right = FREESECT
        self.child = FREESECT
        self.start = 0
        self.size = 0


def _orden(entries, idxs):
    return sorted(idxs, key=lambda i: (len(entries[i].name),
                                       entries[i].name.upper()))


def _arbol(entries, idxs):
    if not idxs:
        return FREESECT
    mid = len(idxs) // 2
    nodo = idxs[mid]
    entries[nodo].left = _arbol(entries, idxs[:mid])
    entries[nodo].right = _arbol(entries, idxs[mid + 1:])
    return nodo


def _pack_entry(e):
    nombre = e.name.encode("utf-16-le") + b"\x00\x00"
    if len(nombre) > 64:
        raise ValueError("nombre demasiado largo: %s" % e.name)
    buf = bytearray(128)
    buf[0:len(nombre)] = nombre
    struct.pack_into("<H", buf, 64, len(nombre))
    buf[66] = e.kind
    buf[67] = 1                                   # color negro
    struct.pack_into("<III", buf, 68, e.left, e.right, e.child)
    struct.pack_into("<I", buf, 116, e.start)
    struct.pack_into("<II", buf, 120, e.size, 0)
    return bytes(buf)


def _build_ole(streams):
    """streams: lista de (ruta, datos). Solo se soporta /VBA como subalmacen."""
    root = _Entry("Root Entry", 5)
    entries = [root]
    idx = {}

    almacenes = []
    for ruta, datos in streams:
        partes = ruta.split("/")
        if len(partes) == 2 and partes[0] not in idx:
            e = _Entry(partes[0], 1)
            entries.append(e)
            idx[partes[0]] = len(entries) - 1
            almacenes.append(partes[0])
    for ruta, datos in streams:
        e = _Entry(ruta.split("/")[-1], 2, datos)
        entries.append(e)
        idx[ruta] = len(entries) - 1

    # arbol de la raiz
    hijos_raiz = [idx[n] for n in almacenes]
    hijos_raiz += [idx[r] for r, _ in streams if "/" not in r]
    root.child = _arbol(entries, _orden(entries, hijos_raiz))
    for nombre in almacenes:
        hijos = [idx[r] for r, _ in streams if r.startswith(nombre + "/")]
        entries[idx[nombre]].child = _arbol(entries, _orden(entries, hijos))

    # --- mini stream ---
    grandes = [e for e in entries if e.kind == 2 and len(e.data) >= 4096]
    chicos = [e for e in entries if e.kind == 2 and 0 < len(e.data) < 4096]
    vacios = [e for e in entries if e.kind == 2 and len(e.data) == 0]
    for e in vacios:
        e.start = ENDOFCHAIN
        e.size = 0

    mini = bytearray()
    minifat = []
    for e in chicos:
        primero = len(mini) // 64
        e.start = primero
        e.size = len(e.data)
        relleno = (-len(e.data)) % 64
        mini += e.data + b"\x00" * relleno
        n = (len(e.data) + 63) // 64
        for i in range(n):
            minifat.append(primero + i + 1 if i < n - 1 else ENDOFCHAIN)

    sectores = []
    cadenas = []

    def alloc(data):
        if not data:
            return ENDOFCHAIN, 0
        primero = len(sectores)
        n = (len(data) + 511) // 512
        for i in range(n):
            trozo = data[i * 512:(i + 1) * 512]
            sectores.append(trozo + b"\x00" * (512 - len(trozo)))
        cadenas.append((primero, n))
        return primero, n

    for e in grandes:
        e.start, _ = alloc(e.data)
        e.size = len(e.data)

    root.start, _ = alloc(bytes(mini))
    root.size = len(mini)

    minifat_bytes = b"".join(struct.pack("<I", v) for v in minifat)
    if minifat_bytes:
        relleno = (-len(minifat_bytes)) % 512
        minifat_bytes += struct.pack("<I", FREESECT) * (relleno // 4)
    minifat_start, minifat_n = alloc(minifat_bytes)

    dir_bytes = b"".join(_pack_entry(e) for e in entries)
    relleno = (-len(dir_bytes)) % 512
    if relleno:
        vacio = _Entry("", 0)
        dir_bytes += _pack_entry(vacio) * (relleno // 128)
    dir_start, dir_n = alloc(dir_bytes)

    total = len(sectores)
    nfat = 1
    while nfat * 128 < total + nfat:
        nfat += 1

    fat = [FREESECT] * (nfat * 128)
    for primero, n in cadenas:
        for i in range(n):
            fat[primero + i] = primero + i + 1 if i < n - 1 else ENDOFCHAIN
    for i in range(nfat):
        fat[total + i] = FATSECT

    fat_bytes = b"".join(struct.pack("<I", v) for v in fat)
    for i in range(nfat):
        sectores.append(fat_bytes[i * 512:(i + 1) * 512])

    cabecera = bytearray(512)
    cabecera[0:8] = b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"
    struct.pack_into("<HH", cabecera, 24, 0x003E, 0x0003)
    struct.pack_into("<H", cabecera, 28, 0xFFFE)
    struct.pack_into("<HH", cabecera, 30, 9, 6)
    struct.pack_into("<I", cabecera, 44, nfat)
    struct.pack_into("<I", cabecera, 48, dir_start)
    struct.pack_into("<I", cabecera, 56, 4096)
    struct.pack_into("<I", cabecera, 60, minifat_start)
    struct.pack_into("<I", cabecera, 64, minifat_n)
    struct.pack_into("<I", cabecera, 68, ENDOFCHAIN)
    struct.pack_into("<I", cabecera, 72, 0)
    for i in range(109):
        valor = total + i if i < nfat else FREESECT
        struct.pack_into("<I", cabecera, 76 + i * 4, valor)
    if nfat > 109:
        raise ValueError("el proyecto necesita DIFAT extendida")

    return bytes(cabecera) + b"".join(sectores)


# ==========================================================================
# API
# ==========================================================================
def _fuente(path):
    with open(path, encoding="utf-8") as fh:
        texto = fh.read()
    # El encabezado VERSION/BEGIN/END solo existe en los .cls exportados; el
    # flujo del modulo empieza directamente en los Attribute.
    if texto.startswith("VERSION"):
        fin = texto.find("END\r\n")
        if fin < 0:
            fin = texto.find("END\n")
            texto = texto[fin + 4:]
        else:
            texto = texto[fin + 5:]
    return texto.replace("\r\n", "\n").replace("\n", "\r\n")


def build(project_name="Cotizador"):
    modulos = [
        {"name": "ThisDocument", "type": MODULE_DOC,
         "src": _fuente(os.path.join(VBA_DIR, "ThisDocument.cls"))},
        {"name": "Cotizador", "type": MODULE_STD,
         "src": _fuente(os.path.join(VBA_DIR, "Cotizador.bas"))},
    ]
    for m in modulos:
        m["offset"] = 0
        m["stream"] = compress(m["src"].encode("cp1252", "replace"))
        assert decompress(m["stream"]) == m["src"].encode("cp1252", "replace")

    dir_data = _dir_stream(project_name, modulos)
    dir_comp = compress(dir_data)
    assert decompress(dir_comp) == dir_data

    streams = [
        ("PROJECT", _project_stream(project_name, modulos)),
        ("PROJECTwm", _projectwm(modulos)),
        ("VBA/_VBA_PROJECT", b"\xCC\x61\xFF\xFF\x00\x00\x00"),
        ("VBA/dir", dir_comp),
    ]
    for m in modulos:
        streams.append(("VBA/%s" % m["name"], m["stream"]))
    return _build_ole(streams)


if __name__ == "__main__":
    data = build()
    destino = os.path.join(HERE, "render", "vbaProject.bin")
    if not os.path.isdir(os.path.dirname(destino)):
        os.makedirs(os.path.dirname(destino))
    with open(destino, "wb") as fh:
        fh.write(data)
    print("vbaProject.bin  %d bytes" % len(data))
    # Comprobacion del cifrado del flujo PROJECT
    for clave, esperado in (("CMG", struct.pack("<I", 0)),
                            ("DPB", b"\x00"), ("GC", b"\xFF")):
        texto = _project_stream("Cotizador", []).decode("cp1252")
        for linea in texto.splitlines():
            if linea.startswith(clave + "="):
                valor = linea.split('"')[1]
                assert _decrypt(valor, PROJECT_ID) == esperado, clave
                print("%-4s ok" % clave)
