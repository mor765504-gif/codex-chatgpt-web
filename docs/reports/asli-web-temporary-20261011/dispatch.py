#!/usr/bin/python3
"""Use existing Codex CLI for Web lifecycle metadata; no native worker or subagent delegation."""
import argparse,json,pathlib,subprocess,sys,os,datetime
L=pathlib.Path(__file__).resolve().parent
ENDPOINT='http://127.0.0.1:17842/v1'
p=argparse.ArgumentParser();p.add_argument('brief',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);p.add_argument('--probe',action='store_true');a=p.parse_args()
brief=a.brief.read_text()
if a.probe:
 if brief.strip()!='Reply exactly TEMPORARY_ROUTE_OK. No tools, links, images or attachments.':sys.exit('Probe payload refused')
else:
 gate=json.loads((L/'verification.json').read_text())
 if gate.get('status')!='PASS':sys.exit('Temporary route not accepted')
if a.output.exists():sys.exit('Output already exists; refuse overwrite')
a.output.parent.mkdir(parents=True,exist_ok=True)
argv=['codex','exec','-m','chatgpt-web/extra-high','-c','openai_base_url="'+ENDPOINT+'"','-c','model_reasoning_effort="xhigh"','-c','features.multi_agent=false','-c','features.multi_agent_v2=false','-s','read-only','-C',str(L),'--skip-git-repo-check','-o',str(a.output),brief]
log=L/'private'/('probe-codex.log' if a.probe else 'dispatch-'+datetime.datetime.now().strftime('%Y%m%dT%H%M%S')+'.log')
os.umask(0o077)
try:
 with open(log,'w') as f:
  result=subprocess.run(argv,stdin=subprocess.DEVNULL,stdout=f,stderr=f,timeout=180)
except subprocess.TimeoutExpired:sys.exit('Web CLI exceeded bounded 180 seconds; inspect private log before retry')
if result.returncode or not a.output.exists() or not a.output.read_text().strip():
 print(json.dumps({'status':'FAILED','exit_code':result.returncode,'private_log':str(log)}));sys.exit(1)
print(json.dumps({'status':'COMPLETED','endpoint':ENDPOINT,'requested_model':'chatgpt-web/extra-high','requested_web_effort':'xhigh','metadata_source':'existing Codex CLI','output':str(a.output)}))
