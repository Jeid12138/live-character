"""Counts key-down transitions while focus mode is enabled; never decodes text."""
import ctypes
import threading
import time


class FocusInput:
    def __init__(self):
        self.enabled = threading.Event()
        self.lock = threading.Lock()
        self.total = 0
        self.epoch = 0
        threading.Thread(target=self._run, daemon=True).start()

    def configure(self, enabled):
        with self.lock:
            if enabled != self.enabled.is_set():
                self.epoch += 1
                self.total = 0
                if enabled:
                    self.enabled.set()
                else:
                    self.enabled.clear()
            return self.total

    def _run(self):
        state = ctypes.windll.user32.GetAsyncKeyState
        keys = [8, 13, 32, *range(48, 58), *range(65, 91), *range(96, 112),
                *range(186, 193), *range(219, 224)]
        seen_epoch = -1
        while True:
            self.enabled.wait()
            with self.lock:
                epoch = self.epoch
            held = {key for key in keys if state(key) & 0x8000}
            with self.lock:
                if epoch == self.epoch and epoch == seen_epoch and self.enabled.is_set():
                    self.total += len(held - previous)
            previous, seen_epoch = held, epoch
            time.sleep(.012)

def foreground_app():
    import ntpath
    from ctypes import wintypes
    user, kernel = ctypes.windll.user32, ctypes.windll.kernel32
    user.GetForegroundWindow.restype = wintypes.HWND
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    pid = wintypes.DWORD()
    user.GetWindowThreadProcessId(user.GetForegroundWindow(), ctypes.byref(pid))
    kernel.OpenProcess.restype = wintypes.HANDLE
    handle = kernel.OpenProcess(0x1000, False, pid.value)
    if not handle: return None
    try:
        buf, size = ctypes.create_unicode_buffer(32768), wintypes.DWORD(32768)
        if kernel.QueryFullProcessImageNameW(wintypes.HANDLE(handle), 0, buf, ctypes.byref(size)):
            return ntpath.basename(buf.value)[:100]
    finally:
        kernel.CloseHandle(wintypes.HANDLE(handle))
