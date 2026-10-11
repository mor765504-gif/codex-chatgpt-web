#!/usr/bin/python3
"""Official manifest/payload/checksum installation steps, scoped private bin only."""
import urllib.request,json,pathlib,hashlib,tarfile,os,datetime
L=pathlib.Path(__file__).resolve().parent
base='https://antigravity-cli-auto-updater-974169037036.us-central1.run.app'
manifest=json.load(urllib.request.urlopen(base+'/manifests/darwin_arm64.json',timeout=20))
url=manifest['url'];expected=manifest['sha512'];dst=L/'private/bin/agy'
if dst.exists():raise SystemExit('Private binary already exists; refuse overwrite')
(L/'private/bin').mkdir(mode=0o700,exist_ok=True)
payload=L/'private/official-agy-payload';h=hashlib.sha512()
with urllib.request.urlopen(url,timeout=60) as r,payload.open('xb') as f:
 while True:
  data=r.read(1024*1024)
  if not data:break
  h.update(data);f.write(data)
if h.hexdigest()!=expected:raise SystemExit('Official SHA512 mismatch: refusing install')
if '.tar.gz' in url:
 with tarfile.open(payload,'r:gz') as tar:
  member=tar.getmember('antigravity')
  if not member.isfile():raise SystemExit('Unexpected binary archive member')
  with tar.extractfile(member) as src,dst.open('xb') as f:f.write(src.read())
else:
 payload.rename(dst)
dst.chmod(0o700)
report={'installed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'platform':'darwin_arm64','manifest_version':manifest.get('version'),'official_payload_sha512_verified':True,'payload_sha512':h.hexdigest(),'binary':str(dst),'shell_settings_changed':False,'global_settings_changed':False,'security_permissions_changed':False,'installer_note':'Official manifest/download/SHA512/native payload steps reused; skip install subcommand that edits shell profiles. No quarantine bypass.'}
(L/'agy-installation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
