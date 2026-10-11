#!/usr/bin/python3
"""One bounded official headless run per authorized T0 brief; private NDJSON, shareable output."""
import pathlib,json,subprocess,time,datetime,os
L=pathlib.Path(__file__).resolve().parent; os.umask(0o077)
gate=json.loads((L/'agy-verification.json').read_text())
if gate.get('status')!='PASS':raise SystemExit('Official Flash gate must PASS')
TASKS=['ag-g1-management-evidence','ag-g2-monitor-layout','ag-g3-bounded-delivery-audit']
SOURCE=pathlib.Path('/Users/run176504/Documents/Workspace/control-plane/lanes/asli-t0-20261011/agy-fanout')
records=[];procs={}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save():(L/'agy-worker-registers.json').write_text(json.dumps({'updated_at':now(),'workers':records},indent=2)+'\n')
for task in TASKS:
 cwd=L/task;cwd.mkdir(exist_ok=True)
 receipt=cwd/'receipt.json'
 if receipt.exists():raise SystemExit('Existing task receipt: refuse duplicate '+task)
 brief=(SOURCE/(task+'.brief.md')).read_text()
 raw=L/'private'/(task+'.ndjson');err=L/'private'/(task+'.stderr')
 out=open(raw,'x');stderr=open(err,'x')
 argv=[str(L/'private/bin/agy'),'-p',brief,'--model','gemini-3.8-flash-medium','--effort','medium','--sandbox','--output-format','stream-json','--print-timeout','5m']
 proc=subprocess.Popen(argv,cwd=cwd,stdin=subprocess.DEVNULL,stdout=out,stderr=stderr,start_new_session=True)
 out.close();stderr.close()
 r={'id':task,'state':'RUNNING','pid':proc.pid,'started_at':now(),'requested_model':'gemini-3.8-flash-medium','effort':'medium','sandbox':True,'workspace':str(cwd),'source_brief':str(SOURCE/(task+'.brief.md')),'acceptance':'PENDING','output_expected':str(cwd/(task+'.md'))}
 receipt.write_text(json.dumps(r,indent=2)+'\n');records.append(r);procs[task]=(proc,time.monotonic(),receipt)
 save();print(json.dumps({'id':task,'pid':proc.pid,'state':'RUNNING'}),flush=True)
while procs:
 for task,(proc,start,receipt) in list(procs.items()):
  if proc.poll() is None and time.monotonic()-start>330:proc.terminate()
  if proc.poll() is None:continue
  events=[]
  for line in (L/'private'/(task+'.ndjson')).read_text().splitlines():
   try:events.append(json.loads(line))
   except ValueError:continue
  init=next((x for x in events if x.get('event')=='init'),{});result=next((x.get('result',{}) for x in events if x.get('event')=='result'),{})
  r=next(x for x in records if x['id']==task)
  r.update({'exit_code':proc.returncode,'completed_at':now(),'init_model':init.get('init',{}).get('model'),'init_cid':init.get('conversation_id'),'result_cid':result.get('conversation_id'),'result_status':result.get('status'),'permission_mode':init.get('init',{}).get('permission_mode'),'reply_nonempty':bool(result.get('response','').strip())})
  response=result.get('response','').strip();artifact=L/task/(task+'.response.md')
  if response:
   with artifact.open('x') as f:f.write(response+'\n')
   r['response_artifact']=str(artifact)
  r['written_artifact_exists']=(L/task/(task+'.md')).is_file()
  r['state']='EXECUTION_COMPLETED' if proc.returncode==0 and r['init_model']==r['requested_model'] and result.get('status')=='SUCCESS' and bool(r['init_cid']) and r['init_cid']==r['result_cid'] and response else 'BLOCKED'
  r['acceptance']='PENDING_T0_REVIEW';receipt.write_text(json.dumps(r,indent=2)+'\n');del procs[task];save();print(json.dumps({'id':task,'state':r['state'],'reply_nonempty':bool(response),'exit_code':proc.returncode}),flush=True)
 time.sleep(1)
