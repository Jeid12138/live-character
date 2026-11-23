"""Bounded JSON transports; decrypted credentials are request-scoped; encryption is owned by Electron."""
import os, shutil, subprocess, pathlib, uuid, io, wave
import json, urllib.request, urllib.parse, urllib.error, base64
import contextlib, contextvars, http.client, socket, threading
from dataclasses import dataclass


@dataclass(frozen=True)
class CompleteWav:
    data: bytes


_voice_scope = contextvars.ContextVar('voice_scope', default=None)


@contextlib.contextmanager
def voice_scope(cancelled):
    done = threading.Event()
    callbacks = []
    lock = threading.Lock()
    def watch():
        while not done.wait(.1):
            if cancelled():
                with lock:
                    for interrupt in callbacks:
                        with contextlib.suppress(OSError):
                            interrupt()
                return
    token = _voice_scope.set((cancelled, callbacks, lock))
    thread = threading.Thread(target=watch, daemon=True)
    thread.start()
    try:
        yield
    finally:
        done.set()
        thread.join()
        _voice_scope.reset(token)


def voice_cancelled():
    scope = _voice_scope.get()
    return scope is not None and scope[0]()


def interrupt_on_voice_cancel(interrupt):
    scope = _voice_scope.get()
    if scope is None:
        return
    cancelled, callbacks, lock = scope
    with lock:
        if cancelled():
            with contextlib.suppress(OSError):
                interrupt()
        else:
            callbacks.append(interrupt)


def _track_connection(base):
    class Connection(base):
        def connect(self):
            if voice_cancelled():
                raise InterruptedError('语音请求已停止')
            super().connect()
            connected = self.sock
            interrupt_on_voice_cancel(lambda: connected.shutdown(socket.SHUT_RDWR))
    return Connection


class VoiceHttpHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(_track_connection(http.client.HTTPConnection), req)


class VoiceHttpsHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(_track_connection(http.client.HTTPSConnection), req, context=self._context)


def voice_handlers():
    if _voice_scope.get() is None:
        return ()
    return (VoiceHttpHandler(), VoiceHttpsHandler())

class BridgeError(ValueError):
    def __init__(self, message, details):
        super().__init__(message)
        self.details = details

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): raise ValueError('接口重定向被拒绝，请填写最终地址')

def endpoint(value, local=False):
    u=urllib.parse.urlsplit(value)
    loop=u.hostname in ('127.0.0.1','localhost','::1')
    if u.username or u.password or u.fragment or not u.hostname: raise ValueError('接口地址无效')
    if local and not loop: raise ValueError('此接口只支持本机服务')
    if u.scheme!='https' and not (u.scheme=='http' and loop): raise ValueError('远程接口必须使用 HTTPS')
    return value

def post_json(url,data,key='',local=False,timeout=90):
    endpoint(url,local)
    headers={'Content-Type':'application/json'}
    if key: headers['Authorization']='Bearer '+key
    req=urllib.request.Request(url,json.dumps(data,ensure_ascii=False).encode(),headers,method='POST')
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect, *voice_handlers()).open(req,timeout=timeout) as r:
            raw=r.read(24*1024*1024+1)
        if len(raw)>24*1024*1024: raise ValueError('接口响应过大')
        return json.loads(raw)
    except urllib.error.HTTPError as e:
        try: details = json.loads(e.read(12000))
        except (ValueError, AttributeError): details = {}
        if not isinstance(details, dict): details = {}
        message = str(details.get('error') or '服务返回 HTTP '+str(e.code))
        raise BridgeError(message, {k:details[k] for k in ('code','diagnostics','submitted') if k in details}) from None
    except urllib.error.URLError: raise ValueError('无法连接服务，请检查地址与服务状态') from None

def dsh_status():
    return {'available':True,'message':'已由当前 DSH 插件连接'}

def decide(body):
    payload = body.get('payload')
    if not isinstance(payload,dict): raise ValueError('缺少决策请求')
    return post_json(os.environ['PET_BRIDGE'], payload, os.environ['PET_SECRET'], True,timeout=250 if payload.get('event',{}).get('type')=='adapt' else 90)

def synthesize(body):
    text=str(body.get('text',''))[:2000]
    if not text: raise ValueError('没有朗读文字')
    if body.get('mode') in ('breeze-managed','managed'):
        import managed_voice
        return managed_voice.synthesize(body)
    if body.get('mode')=='breeze': return breeze_synthesize(body,text)
    if body.get('mode')=='api':
        import tts_api
        return tts_api.synthesize(body,str(body.get('text','')))
    ref=body.get('reference')
    if ref and (not isinstance(ref,dict) or len(ref.get('base64',''))>12*1024*1024): raise ValueError('参考音频过大或格式不正确')
    result=post_json(body.get('endpoint',''),{'text':text,'voice':str(body.get('voice',''))[:100],'reference':ref,'reference_text':str(body.get('reference_text',''))[:2000]},local=True)
    audio=result.get('audio',{})
    if audio.get('mime') not in ('audio/wav','audio/mpeg','audio/ogg'): raise ValueError('语音服务须返回 WAV / MP3 / OGG')
    try:
        data=base64.b64decode(audio.get('base64',''),validate=True)
        if not data or len(data)>16*1024*1024: raise ValueError()
    except Exception: raise ValueError('语音服务返回了无效音频') from None
    return result


def breeze_synthesize(body,text):
    with breeze_response(body,text) as r:
        mime=r.headers.get_content_type()
        rate=r.headers.get('X-Sample-Rate','24000')
        sample_format=r.headers.get('X-Sample-Format','s16le')
        data=r.read(16*1024*1024+1)
    if not data or len(data)>16*1024*1024: raise ValueError('Breeze 音频为空或超过 16MB')
    if mime in ('audio/wav','audio/x-wav'):
        if data[:4]!=b'RIFF' or data[8:12]!=b'WAVE': raise ValueError('Breeze 返回无效 WAV')
    else:
        if mime not in ('audio/pcm','application/octet-stream') or rate!='24000' or sample_format!='s16le': raise ValueError('Breeze 须返回 24kHz s16le 单声道 PCM 或 WAV')
        if len(data)%2: raise ValueError('Breeze PCM 音频被截断')
        output=io.BytesIO()
        with wave.open(output,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000);wav.writeframes(data)
        data=output.getvalue()
    return {'audio':{'mime':'audio/wav','base64':base64.b64encode(data).decode()}}


def breeze_response(body,text):
    url=endpoint(body.get('endpoint',''),local=True)
    instruction=str(body.get('instruction','')).strip()[:2000]
    transcript=str(body.get('reference_text','')).strip()[:2000]
    ref=body.get('reference')
    fields={'text':text,'cfg_scale':'4' if instruction else '1'}
    if instruction: fields['instruction']=instruction
    audio=None
    if ref:
        if not isinstance(ref,dict) or not isinstance(ref.get('base64'),str) or len(ref['base64'])>12*1024*1024: raise ValueError('参考音频过大或格式不正确')
        try: audio=base64.b64decode(ref['base64'],validate=True)
        except Exception: raise ValueError('参考音频编码无效') from None
        if not audio or len(audio)>8*1024*1024: raise ValueError('参考音频须小于等于 8MB')
        if audio[:4]!=b'RIFF' or audio[8:12]!=b'WAVE': raise ValueError('Breeze 参考音频请使用 WAV 格式')
        if not transcript: raise ValueError('音色克隆需要填写参考音频的准确文字稿')
        fields['ref_text']=transcript
    elif not instruction: raise ValueError('请上传参考 WAV 与文字稿，或填写音色描述进行语音设计')
    boundary='LCBreeze'+uuid.uuid4().hex
    parts=[]
    for key,value in fields.items():
        parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+key+'"\r\n\r\n'+value+'\r\n').encode('utf-8'))
    if audio:
        parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="ref_audio"; filename="reference.wav"\r\nContent-Type: audio/wav\r\n\r\n').encode()+audio+b'\r\n')
    parts.append(('--'+boundary+'--\r\n').encode())
    req=urllib.request.Request(url,data=b''.join(parts),headers={'Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
    try:
        return urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect,*voice_handlers()).open(req,timeout=90)
    except urllib.error.HTTPError as e:
        with e:
            if e.code==409: raise ValueError('Breeze 正在合成其他语音，请稍后再试；未自动重试') from None
            raise ValueError('Breeze 返回 HTTP '+str(e.code)+'，请检查服务日志与参考音频') from None
    except urllib.error.URLError: raise ValueError('无法连接 Breeze，请先启动本地语音服务并检查完整地址') from None


def synthesize_stream(body, cancelled):
    if body.get('mode')=='api':
        import tts_api
        yield from tts_api.stream(body,str(body.get('text','')),cancelled)
        return
    text = str(body.get('text',''))[:2000]
    if not text.strip():
        raise ValueError('没有朗读文字')
    mode = body.get('mode')
    model = body.get('model')
    if mode in ('breeze-managed', 'managed'):
        import managed_voice
        if model == managed_voice.BREEZE_ID or (mode == 'breeze-managed' and not model):
            yield from managed_voice.stream(body, cancelled)
            return
        if isinstance(model, str) and model.startswith('piper-'):
            import piper_stream
            yield from piper_stream.stream(body)
            return
    if mode != 'breeze':
        raise ValueError('所选语音引擎未提供实时 PCM')
    with breeze_response(body,text) as response:
        headers = response.headers
        mime = headers.get_content_type()
        if mime in ('audio/wav','audio/x-wav'):
            data = response.read(16*1024*1024+1)
            if len(data)>16*1024*1024:
                raise ValueError('Breeze 音频超过 16MB')
            if data[:4]!=b'RIFF' or data[8:12]!=b'WAVE' or int.from_bytes(data[4:8],'little')+8>len(data):
                raise ValueError('Breeze 返回无效 WAV')
            if not cancelled():
                yield CompleteWav(data)
            return
        if (mime not in ('audio/pcm','application/octet-stream')
                or headers.get('X-Sample-Rate','24000') != '24000'
                or headers.get('X-Sample-Format','s16le') != 's16le'
                or headers.get('X-Channels','1') != '1'):
            raise ValueError('Breeze 实时接口须返回 24kHz s16le 单声道 PCM')
        total = 0
        carry = b''
        while not cancelled():
            chunk = response.read1(8192)
            if not chunk:
                if carry or not total or response.length:
                    raise ValueError('Breeze PCM 音频为空或被截断')
                return
            total += len(chunk)
            if total > 16*1024*1024:
                raise ValueError('Breeze 音频超过 16MB')
            chunk = carry + chunk
            end = len(chunk) & ~1
            carry = chunk[end:]
            if end:
                yield chunk[:end]
