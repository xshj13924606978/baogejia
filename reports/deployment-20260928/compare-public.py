import hashlib,json,pathlib,urllib.request
root=pathlib.Path('/home/xshj/quote-project')
prior=json.loads(pathlib.Path('reports/health-20260928/public-check.json').read_text())
rows=[]
for item in prior:
 p=item['path']
 if not p.startswith('/_next/static/'): continue
 local=root/'.next-production'/p.removeprefix('/_next/')
 row={'path':p,'local_exists':local.is_file()}
 try:
  req=urllib.request.Request('https://xs-bj.com'+p,headers={'Accept-Encoding':'identity','User-Agent':'DeploymentReadOnlyVerification/1.0'})
  with urllib.request.urlopen(req,timeout=20) as response:
   data=response.read(10_000_001)
   if len(data)>10_000_000: raise ValueError('asset size limit')
   row.update(status=response.status,remote_sha256=hashlib.sha256(data).hexdigest())
  if local.is_file():
   row['local_sha256']=hashlib.sha256(local.read_bytes()).hexdigest()
   row['equal']=row['local_sha256']==row['remote_sha256']
 except Exception as e: row['error']=str(e)
 rows.append(row)
pathlib.Path('reports/deployment-20260928/public-byte-comparison.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'assets':len(rows),'identical':sum(r.get('equal',False) for r in rows),'errors':sum('error' in r for r in rows)}))
