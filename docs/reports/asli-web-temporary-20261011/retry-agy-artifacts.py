#!/usr/bin/python3
"""One evidence-driven retry: inline actual primary evidence; no tool permissions changed."""
import pathlib,json,subprocess,time,datetime,os
L=pathlib.Path(__file__).resolve().parent;os.umask(0o077)
S=pathlib.Path('/Users/run176504/Documents/Workspace/control-plane/lanes/asli-t0-20261011/agy-fanout')
packs=json.loads((L/'source-packs.json').read_text());register=json.loads((L/'agy-worker-registers.json').read_text());procs={}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save():(L/'agy-worker-registers.json').write_text(json.dumps(register,indent=2)+'\n')
for r in register['workers']:
 if r['state']!='BLOCKED':raise SystemExit('Refuse retry of nonblocked task')
 task=r['id'];cwd=L/task
 (cwd/'attempt1-receipt.json').write_text(json.dumps(r,indent=2)+'\n')
 context=packs.get('g1' if 'ag-g1' in task else 'g2' if 'ag-g2' in task else 'g3',[])
 prefix='This is an authorized OUTPUT-ONLY drafting turn. Use NO TOOLS whatsoever (no shell, filesystem, browser, search, read_url). Do not attempt to write a file; return the entire final Markdown report in your response. The executor will save that response as the requested artifact. These output-transport instructions supersede file-writing instructions in the original brief. No permission rules have been changed. Do not claim you yourself searched/opened a source; disclose that the executor supplied actually opened primary-source summaries. Unknown data remains unknown. If evidence is insufficient, state the precise gap while delivering the rest. Complete in one response, no questions.\n'+packs['provenance']+'\nSource evidence supplied: '+json.dumps(context,ensure_ascii=False)+'\nOriginal authorized brief:\n'+(S/(task+'.brief.md')).read_text()
 with open(L/'private'/(task+'.attempt2.ndjson'),'x') as out,open(L/'private'/(task+'.attempt2.stderr'),'x') as err:
  proc=subprocess.Popen([str(L/'private/bin/agy'),'-p',prefix,'--model','gemini-3.8-flash-medium','--effort','medium','--sandbox','--output-format','stream-json','--print-timeout','3m'],cwd=cwd,stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True)
 r.update({'state':'RUNNING_ATTEMPT2','attempt':2,'pid':proc.pid,'attempt2_started_at':now(),'retry_reason':'attempt1 auto-denied read_url or command; use inline primary evidence and response output, same sandbox/request-review'})
 (cwd/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');procs[task]=(proc,time.monotonic());print(json.dumps({'task':task,'pid':proc.pid,'state':r['state']}),flush=True)
save()
while procs:
 for task,(proc,start) in list(procs.items()):
  if proc.poll() is None and time.monotonic()-start>195:proc.terminate()
  if proc.poll() is None:continue
  ev=[]
  for ln in (L/'private'/(task+'.attempt2.ndjson')).read_text().splitlines():
   try:ev.append(json.loads(ln))
   except:pass
  init=next((e for e in ev if e.get('event')=='init'),{});result=next((e.get('result',{}) for e in ev if e.get('event')=='result'),{})
  r=next(x for x in register['workers'] if x['id']==task);text=result.get('response','').strip();path=L/task/(task+'.md')
  if text:
   with path.open('x') as f:f.write(text+'\n')
  r.update({'completed_at':now(),'exit_code':proc.returncode,'init_model':init.get('init',{}).get('model'),'init_cid':init.get('conversation_id'),'result_cid':result.get('conversation_id'),'result_status':result.get('status'),'reply_nonempty':bool(text),'permission_mode':init.get('init',{}).get('permission_mode'),'denied_actions':result.get('denied_actions',[]),'artifact':str(path) if text else None,'written_artifact_exists':path.exists(),'acceptance':'PENDING_T0_REVIEW','source_provenance':'executor-fetched primary summaries; worker output-only, not direct browser retrieval'})
  r['state']='EXECUTION_COMPLETED' if proc.returncode==0 and r['init_model']==r['requested_model'] and r['init_cid'] and r['init_cid']==r['result_cid'] and r['result_status']=='SUCCESS' and text else 'BLOCKED_TWO_ATTEMPTS_STOP'
  (L/task/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');del procs[task];save();print(json.dumps({'task':task,'state':r['state'],'nonempty_artifact':bool(text),'exit_code':proc.returncode}),flush=True)
 time.sleep(1)
