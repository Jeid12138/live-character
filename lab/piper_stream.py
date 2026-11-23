"""Stream a locally registered Piper voice as 24 kHz mono signed PCM."""
import pathlib
import subprocess
import sys
import threading


def _write_sentences(model_path):
    # These dependencies belong to the selected Piper environment.
    import numpy as np
    from piper import PiperVoice

    voice = PiperVoice.load(model_path)
    for chunk in voice.synthesize(sys.stdin.buffer.read().decode('utf-8')):
        if chunk.sample_channels != 1 or chunk.sample_width != 2 or chunk.sample_rate <= 0:
            raise ValueError('Unsupported Piper sample format')
        samples = np.frombuffer(chunk.audio_int16_bytes, dtype='<i2')
        if not len(samples):
            continue
        if chunk.sample_rate != 24000:
            count = max(1, round(len(samples) * 24000 / chunk.sample_rate))
            offsets = np.arange(count) * (chunk.sample_rate / 24000)
            samples = np.interp(offsets, np.arange(len(samples)), samples).astype('<i2')
        sys.stdout.buffer.write(samples.tobytes())
        sys.stdout.buffer.flush()


def stream(body):
    import managed_voice
    from companion import interrupt_on_voice_cancel

    text = body.get('text')
    if not isinstance(text, str) or not text.strip() or len(text) > 2000:
        raise ValueError('文本长度须为 1 至 2000 字符')
    path = dict(managed_voice.piper_voices()).get(body.get('model'))
    if not path:
        raise ValueError('未找到所选 Piper 模型和配套 JSON')
    if not managed_voice.piper_ready():
        raise ValueError('Piper 环境尚未准备完成')
    runtime = managed_voice.selected_piper()
    command = managed_voice.external_python(runtime, 'piper')
    if not command:
        raise ValueError('未找到 Piper 的 Python 环境')
    process = subprocess.Popen(
        [*command, '-X', 'utf8', str(pathlib.Path(__file__).resolve()), str(path)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    interrupt_on_voice_cancel(process.kill)
    expired = threading.Event()
    def expire():
        expired.set()
        process.kill()
    timer = threading.Timer(120, expire)
    timer.daemon = True
    timer.start()
    try:
        process.stdin.write(text.encode('utf-8'))
        process.stdin.close()
        total = 0
        carry = b''
        while block := process.stdout.read1(16384):
            total += len(block)
            if total > 16 * 1024 * 1024:
                raise ValueError('Piper 返回的音频超过大小限制')
            block = carry + block
            end = len(block) & ~1
            carry = block[end:]
            if end:
                yield block[:end]
        returncode = process.wait()
        if expired.is_set():
            raise TimeoutError('Piper 流式合成超时')
        if returncode or not total or carry:
            raise ValueError('Piper 流式合成未完成，请检查所选模型及配套 JSON')
    finally:
        timer.cancel()
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdout.close()
        if not process.stdin.closed:
            process.stdin.close()


if __name__ == '__main__':
    _write_sentences(sys.argv[1])
