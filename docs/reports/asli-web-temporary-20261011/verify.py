#!/usr/bin/python3
"""Fresh bounded probe. Only diagnostics emitted by the task-private bridge establish ownership."""
import json,pathlib,urllib.request,urllib.parse,subprocess,time,datetime,os
L=pathlib.Path(__file__).resolve().parent
D=pathlib.Path('/Users/run176504/.codex-chatgpt-web/runtime/launcher-browser.json')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def descriptor():return json.loads(D.read_text())
def targets():return json.load(urllib.request.urlopen(descriptor()['endpoint']+'/json/list',timeout=5))
def alive(pid):
 try:os.kill(pid,0);return True
 except ProcessLookupError:return False
health=json.load(urllib.request.urlopen('http://127.0.0.1:17842/healthz',timeout=5))
if health.get('active_http_turns') or health.get('active_browser_turns'):raise SystemExit('Private bridge busy; do not interfere with another task')
output=L/'private/probe-output.txt'
if output.exists():raise SystemExit('Existing probe preserved; do not rerun accepted evidence without choosing a new run')
root=L/'private/home/diagnostics/browser-turns';prior={p.name for p in root.iterdir()} if root.exists() else set()
before=targets();project_before={t['id']:t['url'] for t in before if urllib.parse.urlparse(t.get('url','')).path.startswith('/g/')}
d0=descriptor();conf=pathlib.Path('/Users/run176504/.codex-chatgpt-web/config.json').read_bytes();start=now()
with open(L/'private/probe-dispatch.json','w') as log:
 result=subprocess.run([str(L/'dispatch.py'),str(L/'probe.txt'),str(output),'--probe'],stdin=subprocess.DEVNULL,stdout=log,stderr=log,timeout=210)
complete=[]
for folder in root.iterdir():
 if folder.name in prior:continue
 for f in folder.glob('*turn-completed.json'):complete.append((folder,json.loads(f.read_text())))
if len(complete)!=1:raise SystemExit('Exact own completed trace missing or ambiguous; fail closed')
folder,terminal=complete[0];rows=[]
for checkpoint in ['effort-selected','effort-selection-confirmed','send-accepted','turn-completed']:
 matches=list(folder.glob('*'+checkpoint+'.json'))
 if len(matches)!=1:raise SystemExit('Missing exact diagnostic checkpoint '+checkpoint)
 d=json.loads(matches[0].read_text());s=d.get('state',{});rows.append({'trace_id':d['traceId'],'checkpoint':d['checkpoint'],'captured_at':d['capturedAt'],'location':s.get('location'),'effort_sliders':[{k:x[k] for k in ['min','max','value','power','enabled'] if k in x} for x in s.get('effortSliders',[])]})
after={t['id']:t for t in targets()};d1=descriptor();reply=output.read_text().strip().replace('\\_','_') if output.exists() else ''
r={'route_id':'asli-t0-web-temporary-17842-20261011','started_at':start,'completed_at':now(),'configured_surface':'Temporary','actual_surface':'Temporary' if all(x.get('location',{}).get('temporaryChat') for x in rows) else 'UNKNOWN','surface_evidence_at':terminal['capturedAt'],'actual_url_sanitized':'https://chatgpt.com/c/<redacted>?temporary-chat=true' if terminal.get('state',{}).get('location',{}).get('pathSegments')==2 else 'https://chatgpt.com/?temporary-chat=true','endpoint':'http://127.0.0.1:17842/v1','trace_id':terminal['traceId'],'requested_model':'chatgpt-web/extra-high','requested_web_effort':'xhigh','web_model_family':'unknown','model_effort_source':'own private bridge diagnostics: selected+confirmed Web slider value 3; exact alias mapping in pinned engine','probe_exit_code':result.returncode,'reply':reply,'probe_reply_ok':reply=='TEMPORARY_ROUTE_OK','own_trace_diagnostics':rows,'shared_config_unchanged':pathlib.Path('/Users/run176504/.codex-chatgpt-web/config.json').read_bytes()==conf,'shared_bridge_pid_alive':alive(7557),'launcher_pid_unchanged':d0['pid']==d1['pid'],'preexisting_project_targets_preserved':all(i in after and after[i].get('url')==u for i,u in project_before.items()),'capacity':'unknown','generation_noninterference_gate':'UNKNOWN'}
r['status']='PASS' if result.returncode==0 and r['probe_reply_ok'] and r['actual_surface']=='Temporary' and any(x.get('value')==3 for row in rows if row['checkpoint']=='effort-selected' for x in row['effort_sliders']) else 'BLOCKED'
(L/'verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
