"""Run with Python 3 on Windows against the bundled Electron archive."""

import base64
import ctypes
import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from ctypes import wintypes
from pathlib import Path


PACKAGE = Path(__file__).resolve().parents[1]
PROBE_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
try {
    if ($PSVersionTable.PSVersion.ToString() -notlike '5.1.*') {
        throw 'Expected Windows PowerShell 5.1'
    }
    $root = $env:LC_PROBE_DIRECTORY
    $tokens = $null
    $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile(
        $env:LC_PROBE_SOURCE, [ref]$tokens, [ref]$errors)
    if ($errors) { throw ($errors | Out-String) }
    foreach ($node in $ast.EndBlock.Statements) {
        if ($node -is [Management.Automation.Language.FunctionDefinitionAst]) {
            Invoke-Expression $node.Extent.Text
        }
    }
    $manifest = Get-Content -LiteralPath $env:LC_PROBE_MANIFEST -Raw -Encoding UTF8 |
        ConvertFrom-Json
    $dep = $manifest.dependencies | Where-Object id -eq 'electron'

    function Get-ProxyNames {
        [Environment]::GetEnvironmentVariables().Keys |
            Where-Object { $_ -ieq 'NO_PROXY' }
    }
    $proxyNames = @(Get-ProxyNames)
    if ($proxyNames -cnotcontains 'NO_PROXY' -or
        ($proxyNames -ccontains 'no_proxy') -ne ($env:LC_PROBE_DUPLICATE -eq '1')) {
        throw "Unexpected native proxy fixture: $proxyNames"
    }
    $original = $env:LC_PROBE_ORIGINAL
    if ($env:ELECTRON_RUN_AS_NODE -cne $original) { throw 'Unexpected node mode fixture' }

    Assert-Runtime $root $dep
    if ($env:ELECTRON_RUN_AS_NODE -cne $original) { throw 'Node mode changed after success' }

    $actualVersion = $dep.version
    $dep.version = 'intentional-mismatch'
    $message = ''
    try { Assert-Runtime $root $dep } catch { $message = $_.Exception.Message }
    if ($message -notlike "*intentional-mismatch*$actualVersion*") {
        throw "Expected an Electron version mismatch, got: $message"
    }
    if ($env:ELECTRON_RUN_AS_NODE -cne $original) { throw 'Node mode changed after failure' }

    $dep.executable = 'missing-electron.exe'
    $message = ''
    try { Assert-Runtime $root $dep } catch { $message = $_.Exception.Message }
    if (!$message) { throw 'Expected an Electron start failure' }
    if ($env:ELECTRON_RUN_AS_NODE -cne $original) { throw 'Node mode changed after start failure' }
    exit 0
} catch {
    $_ | Out-String | Set-Content -LiteralPath $env:LC_PROBE_DIAGNOSTIC -Encoding UTF8
    exit 1
}
"""


def run_with_native_environment(command, entries):
    # Python and .NET environment dictionaries can collapse case-duplicate keys.
    import _winapi

    class StartupInfo(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD),
            ("lpReserved", wintypes.LPWSTR),
            ("lpDesktop", wintypes.LPWSTR),
            ("lpTitle", wintypes.LPWSTR),
            *[(name, wintypes.DWORD) for name in (
                "dwX", "dwY", "dwXSize", "dwYSize", "dwXCountChars",
                "dwYCountChars", "dwFillAttribute", "dwFlags",
            )],
            ("wShowWindow", wintypes.WORD),
            ("cbReserved2", wintypes.WORD),
            ("lpReserved2", ctypes.c_void_p),
            ("hStdInput", wintypes.HANDLE),
            ("hStdOutput", wintypes.HANDLE),
            ("hStdError", wintypes.HANDLE),
        ]

    class ProcessInformation(ctypes.Structure):
        _fields_ = [
            ("hProcess", wintypes.HANDLE),
            ("hThread", wintypes.HANDLE),
            ("dwProcessId", wintypes.DWORD),
            ("dwThreadId", wintypes.DWORD),
        ]

    create_process = ctypes.WinDLL("kernel32", use_last_error=True).CreateProcessW
    create_process.argtypes = [
        wintypes.LPCWSTR, wintypes.LPWSTR, ctypes.c_void_p, ctypes.c_void_p,
        wintypes.BOOL, wintypes.DWORD, ctypes.c_void_p, wintypes.LPCWSTR,
        ctypes.POINTER(StartupInfo), ctypes.POINTER(ProcessInformation),
    ]
    create_process.restype = wintypes.BOOL
    environment = ctypes.create_unicode_buffer(
        "\0".join(f"{key}={entries[key]}" for key in sorted(entries, key=str.upper)) + "\0"
    )
    command_line = ctypes.create_unicode_buffer(subprocess.list2cmdline(command))
    startup = StartupInfo(cb=ctypes.sizeof(StartupInfo))
    process = ProcessInformation()
    if not create_process(
        command[0], command_line, None, None, False,
        0x400 | subprocess.CREATE_NO_WINDOW,  # CREATE_UNICODE_ENVIRONMENT
        environment, None, ctypes.byref(startup), ctypes.byref(process),
    ):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        if _winapi.WaitForSingleObject(process.hProcess, 60000) == _winapi.WAIT_TIMEOUT:
            _winapi.TerminateProcess(process.hProcess, 1)
            _winapi.WaitForSingleObject(process.hProcess, 5000)
            raise TimeoutError("Windows PowerShell probe did not finish")
        return _winapi.GetExitCodeProcess(process.hProcess)
    finally:
        _winapi.CloseHandle(process.hThread)
        _winapi.CloseHandle(process.hProcess)


@unittest.skipUnless(os.name == "nt", "Requires Windows PowerShell 5.1 and Windows Electron")
class ElectronProbeTests(unittest.TestCase):
    def test_probe_with_inherited_environment(self):
        manifest = json.loads((PACKAGE / "runtime-manifest.json").read_text(encoding="utf-8-sig"))
        electron = next(dep for dep in manifest["dependencies"] if dep["id"] == "electron")
        powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        encoded_script = base64.b64encode(PROBE_SCRIPT.encode("utf-16-le")).decode("ascii")
        command = [str(powershell), "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded_script]
        with tempfile.TemporaryDirectory(prefix="LC Electron probe ") as directory:
            with zipfile.ZipFile(PACKAGE / electron["bundledArchive"]) as archive:
                archive.extractall(directory)
            diagnostic = Path(directory) / "probe-error.txt"
            for duplicate in (False, True):
                for original in (None, "preserve-me"):
                    with self.subTest(duplicate=duplicate, original=original):
                        diagnostic.unlink(missing_ok=True)
                        entries = {
                            key: value for key, value in os.environ.items()
                            if key.upper() not in ("NO_PROXY", "ELECTRON_RUN_AS_NODE", "NODE_OPTIONS")
                            and not key.upper().startswith("LC_PROBE_")
                        }
                        entries.update({
                            "NO_PROXY": "localhost",
                            "LC_PROBE_DIRECTORY": directory,
                            "LC_PROBE_SOURCE": str(PACKAGE / "dependencies.ps1"),
                            "LC_PROBE_MANIFEST": str(PACKAGE / "runtime-manifest.json"),
                            "LC_PROBE_DIAGNOSTIC": str(diagnostic),
                            "LC_PROBE_DUPLICATE": str(int(duplicate)),
                        })
                        if duplicate:
                            entries["no_proxy"] = "localhost"
                        if original is not None:
                            entries["ELECTRON_RUN_AS_NODE"] = original
                            entries["LC_PROBE_ORIGINAL"] = original
                        result = run_with_native_environment(command, entries)
                        message = diagnostic.read_text(encoding="utf-8-sig") if diagnostic.exists() else ""
                        self.assertEqual(result, 0, message)


if __name__ == "__main__":
    unittest.main()
