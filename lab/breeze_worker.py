"""Private stdio worker for the upstream Breeze ComfyUI node, without a Web server.
Run in a dedicated environment with torch/torchaudio/transformers and node dependencies.
"""
import argparse
import ast
import base64
import contextlib
import gc
import importlib.util
import io
import json
import pathlib
import sys
import time
import wave


class SynthesisCancelled(Exception):
    pass


def discard_depth_runners(loader, bundle, keep_batch=None):
    import torch
    runners = getattr(bundle.model, '_breeze_depth_runners', {})
    inactive = [batch for batch in runners if batch != keep_batch]
    if not inactive:
        return
    torch.cuda.synchronize(bundle.device)
    # The pinned node uses cudaMallocAsync graph pools. Release graph objects
    # and their static buffers together under its allocator warning filter.
    with loader._silence_captured_pool_warnings():
        for batch in inactive:
            del runners[batch]
        gc.collect()
        torch.cuda.synchronize(bundle.device)
    torch.cuda.empty_cache()


@contextlib.contextmanager
def retain_active_runner(loader, runtime, bundle, enabled):
    if not enabled:
        yield
        return
    get_depth_runner = runtime.get_depth_runner

    def get_active_runner(model, params, cfg_scale, batch, use_graph):
        discard_depth_runners(loader, bundle, keep_batch=batch)
        return get_depth_runner(model, params, cfg_scale, batch, use_graph)

    runtime.get_depth_runner = get_active_runner
    try:
        yield
    finally:
        runtime.get_depth_runner = get_depth_runner


def move_bundle(bundle, device):
    import torch
    if bundle.patchers:
        raise RuntimeError('Breeze 私有工作进程不支持迁移 ComfyUI 接管的模型')
    target = torch.device(device)
    for module in (bundle.model, bundle.codec):
        original_rope = []
        for submodule in module.modules():
            for name, value in vars(submodule).items():
                if not name.endswith('original_inv_freq') or not isinstance(value, torch.Tensor):
                    continue
                frequency = name.replace('original_inv_freq', 'inv_freq')
                current = getattr(submodule, frequency)
                original_rope.append((submodule, name, frequency, value is current or value.is_meta))
        try:
            module.to(target)
        finally:
            # Keep aliases intact even if Module.to moved only some buffers.
            for submodule, name, frequency, alias in original_rope:
                if alias:
                    setattr(submodule, name, getattr(submodule, frequency))
        # A RoPE reset may also retain frequencies distinct from the buffer.
        for submodule, name, frequency, alias in original_rope:
            if not alias:
                setattr(submodule, name, getattr(submodule, name).to(target))
        module._breeze_runtime_device = target


def park_bundle(loader, bundle):
    import torch
    discard_depth_runners(loader, bundle)
    move_bundle(bundle, 'cpu')
    torch.cuda.empty_cache()


class BundleResidency:
    def __init__(self):
        self.state = 'resident'

    def sleep(self, loader, bundle):
        if bundle is not None and self.state != 'parked':
            self.state = 'moving'
            park_bundle(loader, bundle)
            self.state = 'parked'

    def wake(self, loader, bundle):
        if self.state == 'resident':
            return
        self.state = 'moving'
        try:
            move_bundle(bundle, bundle.device)
        except Exception:
            # A failed transfer may already have moved some weights. Only
            # acknowledge sleep once both modules have returned to CPU.
            try:
                self.sleep(loader, bundle)
            except Exception as rollback_error:
                print(f'Breeze CPU rollback failed: {rollback_error}', file=sys.stderr)
            raise
        self.state = 'resident'


def install_frame_hook(runtime):
    """Attach to the pinned node's frame loop in memory."""
    source = pathlib.Path(runtime.__file__)
    tree = ast.parse(source.read_bytes(), filename=str(source))
    implementation = next((node for node in tree.body
                           if isinstance(node, ast.FunctionDef) and node.name == '_generate_codes_impl'), None)
    if implementation is None:
        raise RuntimeError('Breeze 运行时不支持逐帧流式生成')

    class FrameHook(ast.NodeTransformer):
        matches = 0

        def visit_Expr(self, node):
            if ast.unparse(node) != 'frames.append(frame.detach())':
                return node
            self.matches += 1
            return [node, ast.copy_location(ast.parse('_lc_emit_frame(frames)').body[0], node)]

    transform = FrameHook()
    transform.visit(implementation)
    if transform.matches != 1:
        raise RuntimeError('Breeze 运行时不支持逐帧流式生成')
    code = ast.Module(body=[implementation], type_ignores=[])
    import __future__
    exec(compile(ast.fix_missing_locations(code), str(source), 'exec', __future__.annotations.compiler_flag),
         vars(runtime))


def pcm_bytes(samples):
    if not bool(samples.isfinite().all()):
        raise RuntimeError('Breeze 生成了无效音频采样')
    return (samples.detach().float().cpu().clamp(-1, 1).numpy().reshape(-1) * 32767).astype('<i2').tobytes()


def stream_audio(nodes, runtime, bundle, options, reply, progress_callback=None, check_cancelled=None):
    import torch
    emitted = 0
    original_generate = runtime.generate_codes
    original_decode = runtime.decode_codes

    def emit(frames, *, final=False):
        nonlocal emitted
        if check_cancelled is not None:
            check_cancelled()
        count = len(frames) - emitted
        if count == 0 or (not final and count < (4 if emitted == 0 else 8)):
            return
        # Match the Qwen codec's native 25-frame left context.
        start = max(0, emitted - 25)
        pcm = pcm_bytes(original_decode(bundle.codec, torch.stack(frames[start:])))
        stride = bundle.codec.get_decode_upsample_rate() * 2
        chunk = pcm[(emitted - start) * stride:]
        if len(chunk) != count * stride:
            raise RuntimeError('Breeze 流式解码采样数异常')
        reply({'pcm': base64.b64encode(chunk).decode('ascii')})
        emitted = len(frames)

    def generate_stream(model, **kwargs):
        # A mid-generation retry would replay samples already sent.
        runtime.ensure_cuda_rng_usable(kwargs['inputs_embeds'].device)
        return runtime._generate_codes_impl(model, **kwargs)

    def finish_decode(codec, codes):
        with torch.inference_mode():
            emit(codes.unbind(0), final=True)
        return torch.zeros(1)

    runtime._lc_emit_frame = emit
    runtime.generate_codes = generate_stream
    runtime.decode_codes = finish_decode
    try:
        nodes._generate_audio(bundle, **options, progress_callback=progress_callback or (lambda current, maximum: None))
    finally:
        runtime.generate_codes = original_generate
        runtime.decode_codes = original_decode
        runtime._lc_emit_frame = lambda frames: None


def main():
    sys.stdin.reconfigure(encoding='utf-8', errors='strict')
    sys.stdout.reconfigure(encoding='utf-8', errors='strict')
    parser = argparse.ArgumentParser()
    parser.add_argument('--node-dir', required=True)
    parser.add_argument('--models-dir', required=True)
    parser.add_argument('--cancel-file', type=pathlib.Path)
    args = parser.parse_args()
    # Terminate even if the Electron host forcibly kills the laboratory process.
    if sys.platform == 'win32':
        import ctypes
        import os
        import threading
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.restype = ctypes.c_void_p
        handle = kernel.OpenProcess(0x00100000, False, os.getppid())
        if not handle:
            raise RuntimeError('Cannot monitor parent process')
        def monitor():
            kernel.WaitForSingleObject(ctypes.c_void_p(handle), 0xFFFFFFFF)
            os._exit(0)
        threading.Thread(target=monitor, daemon=True).start()
    root = pathlib.Path(args.node_dir).resolve()
    spec = importlib.util.spec_from_file_location('lc_breeze_node', root / '__init__.py', submodule_search_locations=[str(root)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    # Keep protocol stdout clean when upstream logs progress.
    output = sys.stdout
    sys.stdout = sys.stderr
    spec.loader.exec_module(module)
    from lc_breeze_node import loader, nodes, runtime
    models = pathlib.Path(args.models_dir).resolve()
    loader.model_dirs = lambda: [models]
    bundle = None
    residency = BundleResidency()
    frame_hook_installed = False

    def check_cancelled():
        if optimize_idle_vram and args.cancel_file is not None and args.cancel_file.exists():
            raise SynthesisCancelled()

    def reply(result):
        output.write(json.dumps(result, ensure_ascii=False) + '\n')
        output.flush()

    for line in sys.stdin:
        try:
            request = json.loads(line)
            if request.get('op') == 'sleep':
                residency.sleep(loader, bundle)
                reply({'sleeping': True})
                continue
            optimize_idle_vram = request.get('idleVramOptimization') is True
            check_cancelled()
            text = str(request.get('text', '')).strip()
            instruction = str(request.get('instruction', '')).strip()
            if not text or len(text) > 2000:
                raise ValueError('朗读文字须为 1–2000 字')
            reference = request.get('reference')
            ref_audio = None
            transcript = str(request.get('reference_text', '')).strip()
            if reference:
                import soundfile
                import torch
                data = base64.b64decode(reference['base64'], validate=True)
                if len(data) > 8 * 1024 * 1024:
                    raise ValueError('参考 WAV 超过 8 MB')
                if not transcript:
                    raise ValueError('请填写参考音频的准确文字稿')
                samples, rate = soundfile.read(io.BytesIO(data), dtype='float32', always_2d=True)
                ref_audio = {'waveform':torch.from_numpy(samples.T.copy()).unsqueeze(0), 'sample_rate':rate}
            elif not instruction:
                raise ValueError('无参考音频时需要音色描述')
            decode_mode = 'cuda_graphs' if request.get('cudaGraph') is True else 'eager'
            if bundle is None or bundle.decode_mode != decode_mode:
                bundle = None
                bundle = loader.load_breeze_bundle(loader.BF16_LABEL, 'auto', 'cuda', 'sdpa', False, decode_mode)
                residency = BundleResidency()
            else:
                residency.wake(loader, bundle)
            check_cancelled()
            options = dict(text=text, instruction=instruction, ref_audio=ref_audio, ref_text=transcript or None,
                           cfg_scale=4 if instruction else 1, max_new_tokens=1500, temperature=.9, top_k=50, top_p=1.,
                           repetition_penalty=1.1, depth_temperature=.9, depth_top_k=50, depth_top_p=1., seed=42)
            last_progress = 0.0

            def progress(current, maximum):
                nonlocal last_progress
                check_cancelled()
                now = time.monotonic()
                if now - last_progress >= 1:
                    last_progress = now
                    reply({'progress': current})

            with retain_active_runner(loader, runtime, bundle, optimize_idle_vram):
                if request.get('streaming') is True:
                    if not frame_hook_installed:
                        install_frame_hook(runtime)
                        frame_hook_installed = True
                    stream_audio(nodes, runtime, bundle, options, reply, progress, check_cancelled)
                    result = {'done': True}
                else:
                    audio = nodes._generate_audio(bundle, **options, progress_callback=progress)
                    stream = io.BytesIO()
                    with wave.open(stream, 'wb') as wav:
                        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(audio['sample_rate'])
                        wav.writeframes(pcm_bytes(audio['waveform']))
                    result = {'audio':{'mime':'audio/wav','base64':base64.b64encode(stream.getvalue()).decode()}}
            check_cancelled()
        except SynthesisCancelled:
            result = {'cancelled': True}
        except Exception as error:
            import traceback
            traceback.print_exc(file=sys.stderr)
            result = {'error':str(error)}
        reply(result)

if __name__ == '__main__':
    main()
