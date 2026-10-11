#!/usr/bin/python3
import pathlib,uuid,json,subprocess,datetime,os
L=pathlib.Path(__file__).resolve().parent;os.umask(0o077)
nonce='AGY_MEDIUM_'+uuid.uuid4().hex[:12]
r={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'requested_model':'gemini-3.8-flash-medium','requested_effort':'medium','nonce':nonce,'source':'official CLI 1.3.3','sandbox':True}
with open(L/'private/agy-medium.ndjson','w') as out,open(L/'private/agy-medium.stderr','w') as err:
 p=subprocess.run([str(L/'private/bin/agy'),'-p','Reply exactly '+nonce+'. Do not use tools, read files, create images or perform any other action.','--model',r['requested_model'],'--effort',r['requested_effort'],'--sandbox','--output-format','stream-json','--print-timeout','2m'],cwd=L,stdin=subprocess.DEVNULL,stdout=out,stderr=err,timeout=135)
records=[json.loads(x) for x in (L/'private/agy-medium.ndjson').read_text().splitlines() if x.startswith('{')]
init=next((x for x in records if x.get('event')=='init'),{});final=next((x for x in records if x.get('event')=='result'),{})
r.update({'completed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit_code':p.returncode,'init_model':init.get('init',{}).get('model'),'init_cid':init.get('conversation_id'),'result_cid':final.get('result',{}).get('conversation_id'),'result_status':final.get('result',{}).get('status'),'reply':final.get('result',{}).get('response','').strip(),'permission_mode':init.get('init',{}).get('permission_mode'),'duration_seconds':final.get('result',{}).get('duration_seconds'),'error':final.get('result',{}).get('error')})
r['nonce_match']=r['reply']==nonce;r['cid_match']=bool(r['init_cid']) and r['init_cid']==r['result_cid'];r['status']='PASS' if p.returncode==0 and r['init_model']==r['requested_model'] and r['result_status']=='SUCCESS' and r['nonce_match'] and r['cid_match'] else 'BLOCKED'
(L/'agy-verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
