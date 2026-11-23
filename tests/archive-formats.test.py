"""Actual RAR/7z interoperability regression; run with Python on Windows."""
import os,pathlib,sys,tempfile,subprocess,struct,zlib,zipfile
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'lab'))
import server
with tempfile.TemporaryDirectory() as tmp:
 root=pathlib.Path(tmp); data=b'archive test';name=b'nested/test.txt'
 def hdr(body): return struct.pack('<H',zlib.crc32(body)&65535)+body
 main=hdr(struct.pack('<BHHHI',0x73,0,13,0,0))
 body=struct.pack('<BHHIIBIIBBHI',0x74,0x8000,32+len(name),len(data),len(data),2,zlib.crc32(data),0,20,0x30,len(name),0x20)+name
 rar=root/'model.rar';rar.write_bytes(b'Rar!\x1a\x07\x00'+main+hdr(body)+data+hdr(struct.pack('<BHH',0x7b,0,7)))
 (root/'nested').mkdir();(root/'nested/test.txt').write_bytes(data)
 unicode_name='nested/中文🐋[动作].txt'
 (root/unicode_name).write_bytes(data+b' Unicode')
 seven=root/'model.7z';subprocess.run([str(pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'System32/tar.exe'),'-caf',str(seven),'-C',str(root),'nested'],check=True)
 zp=root/'model.zip'
 with zipfile.ZipFile(zp,'w') as a:a.writestr(name.decode(),data)
 for file in (rar,seven,zp):
  with server.open_archive(file) as a:assert a.read(name.decode())==data
  dest=root/(file.suffix[1:]+'-out');server.extract_model(file,dest);assert (dest/name.decode()).read_bytes()==data
 with server.open_archive(seven) as a:
  assert unicode_name in a.namelist()
  assert a.read(unicode_name)==data+b' Unicode'
 assert (root/'7z-out'/unicode_name).read_bytes()==data+b' Unicode'
 bad=root/'bad.7z';bad.write_bytes(b'broken')
 wrong_format=root/'zip.7z';wrong_format.write_bytes(zp.read_bytes())
 for invalid_file in (bad,wrong_format):
  try:server.open_archive(invalid_file)
  except ValueError as e:assert '分卷' in str(e)
  else:raise AssertionError(f'invalid archive accepted: {invalid_file}')
 print('RAR4, Unicode 7z, ZIP and corrupt or mismatched archives: passed')
