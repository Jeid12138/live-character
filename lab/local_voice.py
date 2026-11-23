"""Read-only local checkpoint diagnostics. Never imports GPU libraries or loads tensors."""
import json
import pathlib
import struct


def inspect_checkpoint(value):
    path = pathlib.Path(str(value)).expanduser()
    if not path.is_file() or path.suffix.lower() != '.safetensors':
        raise ValueError('请选择存在的 .safetensors 权重文件')
    size = path.stat().st_size
    with path.open('rb') as source:
        prefix = source.read(8)
        if len(prefix) != 8:
            raise ValueError('权重文件头不完整')
        length = struct.unpack('<Q', prefix)[0]
        if length < 2 or length > min(32 * 1024 * 1024, size - 8):
            raise ValueError('权重文件头长度无效')
        try:
            header = json.loads(source.read(length))
        except (ValueError, UnicodeDecodeError):
            raise ValueError('无法解析 safetensors 文件头') from None
    if not isinstance(header, dict):
        raise ValueError('权重文件头无效')
    tensors = {k:v for k,v in header.items() if k != '__metadata__'}
    if not tensors:
        raise ValueError('权重文件没有张量')
    dtypes = set()
    for tensor in tensors.values():
        if not isinstance(tensor, dict):
            raise ValueError('权重张量索引无效')
        offsets = tensor.get('data_offsets')
        if not isinstance(offsets, list) or len(offsets) != 2 or any(type(n) is not int for n in offsets) or not 0 <= offsets[0] <= offsets[1] <= size - 8 - length:
            raise ValueError('权重张量超出文件范围，文件可能未下载完整')
        dtypes.add(str(tensor.get('dtype', 'unknown')))
    companions = {name:(path.parent / name).is_file() for name in ('config.json','tokenizer.json','tokenizer_config.json')}
    return {'path':str(path.resolve()),'bytes':size,'tensorCount':len(tensors),'dtypes':sorted(dtypes),'hasCodec':any(k.startswith('codec_model.') for k in tensors),'companions':companions,'ready':False,'state':'checkpoint_inspected','message':'已读取权重索引；尚未验证推理运行时。单个权重文件不能代替完整模型目录。','requirements':{'platform':'Linux','python':'>=3.10','gpu':'NVIDIA CUDA','recommendedVramGiB':12},'source':'https://github.com/breezeblue-ai/breeze-tts'}
