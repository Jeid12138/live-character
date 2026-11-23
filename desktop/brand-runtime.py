"""Prepare LC's Windows executable from the verified Electron installation."""
import ctypes as C
from ctypes import wintypes as W
import hashlib
import os
from pathlib import Path
import shutil
import struct
import sys
import tempfile

kernel = C.WinDLL('kernel32', use_last_error=True)


def winfunc(name, result, *arguments):
    fn = getattr(kernel, name)
    fn.argtypes, fn.restype = arguments, result
    def checked(*args):
        value = fn(*args)
        if not value:
            raise C.WinError(C.get_last_error())
        return value
    return checked


begin = winfunc('BeginUpdateResourceW', W.HANDLE, W.LPCWSTR, W.BOOL)
update = winfunc('UpdateResourceW', W.BOOL, W.HANDLE, C.c_void_p, C.c_void_p, W.WORD, C.c_void_p, W.DWORD)
finish = winfunc('EndUpdateResourceW', W.BOOL, W.HANDLE, W.BOOL)
load = winfunc('LoadLibraryExW', W.HANDLE, W.LPCWSTR, W.HANDLE, W.DWORD)
free = winfunc('FreeLibrary', W.BOOL, W.HANDLE)
find = winfunc('FindResourceExW', W.HANDLE, W.HANDLE, C.c_void_p, C.c_void_p, W.WORD)
size = winfunc('SizeofResource', W.DWORD, W.HANDLE, W.HANDLE)
resource = winfunc('LoadResource', W.HANDLE, W.HANDLE, W.HANDLE)
lock = winfunc('LockResource', C.c_void_p, W.HANDLE)


def version_block(key, value=b'', children=(), text=False):
    def padded(data):
        return data + bytes(-len(data) % 4)
    head = padded(bytes(6) + (key + '\0').encode('utf-16le'))
    body = head + value
    for child in children:
        body = padded(body) + child
    return struct.pack('<HHH', len(body), len(value) // (2 if text else 1), int(text)) + body[6:]


def replace_resources(executable, icon):
    lib = load(str(executable), None, 2)
    try:
        # Preserve Electron's fixed runtime version and flags.
        info = find(lib, 16, 1, 1033)
        data = C.string_at(lock(resource(lib, info)), size(lib, info))
        pos = data.index(bytes.fromhex('bd04effe'))
        fixed = data[pos:pos + 52]
    finally:
        free(lib)
    handle = begin(str(executable), False)
    try:
        count = struct.unpack_from('<H', icon, 4)[0]
        group = bytearray(icon[:6])
        for i in range(count):
            offset = 6 + 16 * i
            length, start = struct.unpack_from('<II', icon, offset + 8)
            update(handle, 3, i + 1, 1033, icon[start:start + length], length)
            group.extend(icon[offset:offset + 12] + struct.pack('<H', i + 1))
        update(handle, 14, 1, 1033, bytes(group), len(group))
        fields = {'FileDescription':'Live Character','ProductName':'Live Character',
                  'OriginalFilename':'Live Character.exe','InternalName':'Live Character',
                  'FileVersion':'45.2.3','ProductVersion':'1.0.0',
                  'LegalCopyright':'Electron: Copyright (C) 2015 GitHub, Inc. All rights reserved.'}
        strings = [version_block(k, (v+'\0').encode('utf-16le'), text=True) for k,v in fields.items()]
        table = version_block('040904B0', children=strings, text=True)
        translation = version_block('Translation', struct.pack('<HH',1033,1200))
        version = version_block('VS_VERSION_INFO',fixed,[
            version_block('StringFileInfo',children=[table],text=True),
            version_block('VarFileInfo',children=[translation],text=True)])
        update(handle, 16, 1, 1033, version, len(version))
    except BaseException:
        finish(handle, True)
        raise
    finish(handle, False)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prepare(root):
    source, target = root / 'electron.exe', root / 'Live Character.exe'
    expected = 'b0ea5b2a533b121815bfd5d9e9d1ff045b69f66e633f7aeeb59e899a1e0220b6'
    if target.is_file() and digest(target) == expected:
        return
    fd, name = tempfile.mkstemp(suffix='.exe',dir=root)
    os.close(fd)
    staged = Path(name)
    try:
        shutil.copyfile(source, staged)
        replace_resources(staged, Path(__file__).with_name('lc.ico').read_bytes())
        if digest(staged) != expected:
            raise ValueError('LC 桌面程序图标和版本校验失败')
        os.replace(staged,target)
    finally:
        staged.unlink(missing_ok=True)


if __name__ == '__main__':
    prepare(Path(sys.argv[1]))
