"""Provider-specific, bounded cloud TTS. No credentials or signed URLs are logged."""
import base64,io,json,re,urllib.request,urllib.parse,urllib.error,wave,ssl,socket,http.client
LIMIT=16*1024*1024
QWEN_PATH='/api/v1/services/aigc/multimodal-generation/generation'

def valid_api_key(value):
    return isinstance(value,str) and 0<len(value)<=4096 and all(33<=ord(ch)<=126 for ch in value)

class TtsError(ValueError):
    def __init__(self,message,**details):
        super().__init__(message)
        self.voice_details=details

def network_error(error,phase,proxy_used):
    reason=error.reason if isinstance(error,urllib.error.URLError) else error
    kind=type(reason).__name__
    if isinstance(reason,ssl.SSLCertVerificationError):code='ssl_certificate_error';message='TLS 证书验证失败，请检查系统时间、证书或代理证书；未关闭证书校验'
    elif isinstance(reason,ssl.SSLEOFError):
        code='proxy_tls_eof' if proxy_used else 'tls_eof'
        message='代理路径的 TLS 连接提前断开，请尝试直连或检查代理规则' if proxy_used else '直连 TLS 连接提前断开，请检查网络路径'
    elif isinstance(reason,ssl.SSLError):code='tls_error';message='TLS 握手失败，请检查网络或代理设置'
    elif isinstance(reason,socket.gaierror):code='dns_error';message='域名解析失败，请检查 DNS 或代理设置'
    elif isinstance(reason,(TimeoutError,socket.timeout)):code=phase+'_timeout';message='连接超时' if phase=='connect' else '读取音频超时'
    elif isinstance(reason,ConnectionRefusedError):code='connect_refused';message='连接被拒绝，请检查服务或系统代理是否已启动'
    elif isinstance(reason,(ConnectionResetError,http.client.RemoteDisconnected)):code='connection_reset';message='连接被远端或代理中断'
    else:code='network_error';message='网络请求失败，请检查语音网络设置'
    return TtsError(message+'；未自动重试',stage=phase,errorCode=code,errorType=kind if re.fullmatch(r'[A-Za-z_]{1,64}',kind) else 'NetworkError',proxyUsed=proxy_used)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): raise ValueError('语音服务重定向被拒绝，请使用最终接口地址')

def validate_url(provider,url):
    try: u=urllib.parse.urlsplit(url);port=u.port
    except Exception: raise ValueError('语音接口地址无效') from None
    if not u.hostname or u.username or u.password or u.query or u.fragment: raise ValueError('请填写不含密钥和查询参数的语音接口地址')
    if provider in ('index','auk'): raise ValueError('此模型暂无已接入的官方云 API；请选择已支持服务或通用本地适配器')
    if provider=='breeze':
        if u.path.rstrip('/') not in ('','/v1'): raise ValueError('Breeze 请填写 https://api.breeze.blue；entitlements 是权益查询，不能生成语音')
        if u.scheme!='https' or u.hostname!='api.breeze.blue' or port not in (None,443): raise ValueError('Breeze 官方 API 地址应为 https://api.breeze.blue')
    elif provider=='fish':
        if u.scheme!='https' or u.hostname!='api.fish.audio' or port not in (None,443) or u.path!='/v1/tts':raise ValueError('Fish 官方合成地址应为 https://api.fish.audio/v1/tts')
    elif provider=='qwen':
        if u.scheme!='https' or u.hostname not in ('dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com') or port not in (None,443) or u.path!=QWEN_PATH:raise ValueError('请选择百炼北京或新加坡的官方语音地址')
    elif provider=='openai':
        if u.hostname in ('api.breeze.blue','api.fish.audio','dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com'):raise ValueError('此服务不使用 OpenAI 兼容协议，请先选择对应语音服务商')
        if u.scheme!='https' and not (u.scheme=='http' and u.hostname in ('localhost','127.0.0.1','::1')):raise ValueError('远程语音接口必须使用 HTTPS')
    else:raise ValueError('未知语音服务商')
    return u

def build(body,text):
    provider=body.get('provider') or 'openai';url=body.get('endpoint','');u=validate_url(provider,url)
    key=body.get('key','')
    if not valid_api_key(key):raise ValueError('请先保存此服务的 API Key')
    model=str(body.get('model','')).strip();voice=str(body.get('voice','')).strip();instruction=str(body.get('instruction','')).strip()
    if not model or len(model)>150:raise ValueError('请选择语音模型')
    if not voice or len(voice)>200 or re.search(r'[\r\n]',voice):raise ValueError('请填写该服务支持的音色 ID')
    if not text.strip() or len(text)>2000:raise ValueError('朗读文字须为 1–2000 字；未截断或发起请求')
    headers={'Content-Type':'application/json','Accept':'audio/wav'}
    if provider=='breeze':
        if model not in ('breeze-tts-2','breeze-tts-2-multilingual'):raise ValueError('请选择有效的 Breeze 模型')
        if len(text)>1000 or len(instruction)>1000:raise ValueError('Breeze 当前每次最多 1000 字；演绎指令最多 1000 字，未自动截断')
        url=u.scheme+'://'+u.netloc+'/v1/text-to-speech/'+urllib.parse.quote(voice,safe='')+'?output_format=wav_24000'
        headers['xi-api-key']=key;payload={'text':text,'model_id':model}
        if instruction:
            guidance=body.get('guidance',2.5)
            if not isinstance(guidance,(int,float)) or isinstance(guidance,bool) or not 1<=guidance<=10:raise ValueError('Breeze 演绎指令强度须为 1–10')
            payload.update(instructions=instruction,voice_settings={'guidance_scale':guidance})
    elif provider=='fish':
        if model not in ('s2-pro','s2.1-pro','s2.1-pro-free'):raise ValueError('请选择已支持的 Fish S2 模型')
        headers.update(Authorization='Bearer '+key,model=model)
        payload={'text':text,'reference_id':voice,'format':'wav','latency':'normal'}
    elif provider=='qwen':
        if model!='qwen3-tts-flash':raise ValueError('请选择已支持的 Qwen3-TTS HTTP 模型')
        if len(text)>600:raise ValueError('Qwen HTTP 朗读文字最多 600 字；未截断或发起请求')
        headers.update(Authorization='Bearer '+key,Accept='application/json')
        args={'text':text,'voice':voice,'language_type':'Auto'}
        payload={'model':model,'input':args}
    else:
        headers['Authorization']='Bearer '+key
        payload={'model':model,'input':text,'voice':voice,'response_format':'wav'}
    return provider,url,headers,payload

def request(url,headers,payload=None,network='direct'):
    if network not in ('direct','system'):raise TtsError('语音网络设置无效',stage='validate',errorCode='invalid_network')
    req=urllib.request.Request(url,headers=headers,data=None if payload is None else json.dumps(payload,ensure_ascii=False).encode(),method='GET' if payload is None else 'POST')
    # An explicit empty handler disables both environment and OS proxy inheritance.
    proxies={} if network=='direct' else urllib.request.getproxies()
    target=urllib.parse.urlsplit(url)
    proxy_used=bool(proxies.get(target.scheme)) and not urllib.request.proxy_bypass(target.netloc)
    phase='connect'
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler(proxies),NoRedirect).open(req,timeout=90) as response:
            phase='read';raw=response.read(LIMIT+1);mime=response.headers.get_content_type()
        if not raw or len(raw)>LIMIT:raise TtsError('语音响应为空或超过 16MB',stage='audio',errorCode='invalid_audio',proxyUsed=proxy_used)
        return raw,mime
    except urllib.error.HTTPError as e:
        code=''
        try:
            obj=json.loads(e.read(8192));detail=obj.get('error') or obj.get('detail') or obj
            if isinstance(detail,dict):code=str(detail.get('code') or detail.get('status') or '')
            else:code=str(obj.get('code',''))
        except Exception:pass
        secrets=[str(v) for k,v in headers.items() if k.lower() in ('authorization','xi-api-key')]
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{0,79}',code) or any(code in v or v.removeprefix('Bearer ') in code for v in secrets if v):code=''
        auth_hint='Breeze 未接受此 API Key；请确认填写的是创建时显示的完整密钥，而非公开密钥 ID；已保存密钥仍保留' if target.hostname=='api.breeze.blue' else '密钥无效或地域不匹配；已保存密钥仍保留' if target.hostname in ('dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com') else '服务未接受此 API Key；已保存密钥仍保留'
        hints={401:auth_hint,403:'没有模型或音色权限',402:'账户余额或套餐不足',429:'达到限流、并发或额度限制；未自动重试'}
        raise TtsError('语音服务 HTTP '+str(e.code)+(' / '+code if code else '')+'：'+hints.get(e.code,'请核对模型、音色及服务状态；未自动重试'),stage='http',httpStatus=e.code,errorCode=code or 'http_error',errorType='HTTPError',proxyUsed=proxy_used) from None
    except TtsError:raise
    except (urllib.error.URLError,TimeoutError,OSError,http.client.HTTPException) as e:raise network_error(e,phase,proxy_used) from None


def audio_result(raw,mime):
    if raw[:4]==b'RIFF' and raw[8:12]==b'WAVE':
        try:
            with wave.open(io.BytesIO(raw)) as wav:
                if wav.getnframes()<1 or wav.getnchannels() not in (1,2):raise ValueError()
                if len(wav.readframes(wav.getnframes()))<wav.getnframes()*wav.getnchannels()*wav.getsampwidth():raise ValueError()
        except Exception:raise ValueError('语音服务返回了不完整或不支持的 WAV') from None
        mime='audio/wav'
    elif (mime in ('audio/mpeg','audio/mp3','application/octet-stream') and (raw[:3]==b'ID3' or len(raw)>2 and raw[0]==255 and raw[1]&224==224)):
        mime='audio/mpeg'
    else:raise ValueError('语音服务没有返回有效 WAV / MP3；可能填入了权益查询或其他非合成接口')
    return {'audio':{'mime':mime,'base64':base64.b64encode(raw).decode()}}

def _synthesize(body,text):
    provider,url,headers,payload=build(body,text)
    network=body.get('network','direct')
    raw,mime=request(url,headers,payload,network=network)
    if provider=='qwen':
        try:
            result=json.loads(raw)
            audio=result['output']['audio'];link=audio.get('url')
        except Exception:raise ValueError('Qwen 未返回 output.audio，请检查地域、模型及音色') from None
        if link:
            u=urllib.parse.urlsplit(link)
            # Official examples return HTTP OSS links. Upgrade only official OSS to HTTPS.
            if u.hostname is None or not u.hostname.endswith('.aliyuncs.com') or '.oss-' not in u.hostname or u.username or u.password or u.fragment or u.port not in (None,443) or u.scheme not in ('http','https'):raise ValueError('Qwen 返回了未认可的音频下载地址')
            link=urllib.parse.urlunsplit(('https',u.netloc,u.path,u.query,''))
            raw,mime=request(link,{'Accept':'audio/wav'},network=network) # API Key must never reach the audio host.
        elif audio.get('data'):
            try:raw=base64.b64decode(audio['data'],validate=True)
            except Exception:raise ValueError('Qwen 返回无效音频编码') from None
            mime='audio/wav'
        else:raise ValueError('Qwen 没有生成可下载音频')
    return audio_result(raw,mime)


def synthesize(body,text):
    try:return _synthesize(body,text)
    except TtsError:raise
    except ValueError as error:
        stage='audio' if '返回' in str(error) or '音频' in str(error) or 'Qwen 没有' in str(error) else 'validate'
        raise TtsError(str(error),stage=stage,errorCode='invalid_audio' if stage=='audio' else 'invalid_request',errorType='ValueError') from None


def check_key(body):
    if body.get('provider')!='breeze':raise TtsError('当前只支持 Breeze 的无合成密钥验证',stage='validate',errorCode='invalid_request')
    validate_url('breeze',body.get('endpoint',''))
    key=body.get('key','')
    if not valid_api_key(key):raise TtsError('API Key 为空或包含不可安全发送的请求头字符',stage='key',errorCode='key_error')
    raw,_=request('https://api.breeze.blue/v1/voices',{'xi-api-key':key,'Accept':'application/json'},network=body.get('network','direct'))
    try:voices=json.loads(raw)['voices']
    except Exception:raise TtsError('音色查询已响应，但返回结构无法识别；这不等于合成密钥无效，可直接试播',stage='http',httpStatus=200,errorCode='invalid_check_response') from None
    if not isinstance(voices,list):raise TtsError('音色查询返回结构无法识别，可直接试播',stage='http',httpStatus=200,errorCode='invalid_check_response')
    return {'validated':True,'httpStatus':200,'checkEndpoint':'voices'}
