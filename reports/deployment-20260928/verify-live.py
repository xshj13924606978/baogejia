import urllib.request,urllib.error,json,pathlib,re,hashlib,sys
root=pathlib.Path('reports/deployment-20260928'); results=[]; pages={}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
def request(path,expected,body=None,headers=None,base='https://xs-bj.com',follow=True):
 req=urllib.request.Request(base+path,data=body,headers={'User-Agent':'ReleaseAcceptance/1.0',**(headers or {})})
 try:
  with (urllib.request.urlopen(req,timeout=25) if follow else urllib.request.build_opener(NoRedirect()).open(req,timeout=25)) as r:status=r.status;data=r.read();final=r.url;location=r.headers.get('Location')
 except urllib.error.HTTPError as e:status=e.code;data=e.read();final=e.url;location=e.headers.get('Location')
 row={'url':base+path,'expected':expected,'status':status,'pass':status==expected,'final_url':final,'location':location}
 results.append(row);return data,row
try:
 for p in ['/','/login','/register','/manifest.json','/robots.txt','/api/health']:
  data,row=request(p,200);pages[p]=data
  if p=='/api/health':
   health=json.loads(data); row['health']=health;row['pass']=row['pass'] and health.get('status')=='healthy'
 request('/login',200,base='https://www.xs-bj.com')
 request('/api/auth/verify-session',401,b'{}',{'Content-Type':'application/json'})
 request('/api/auth/sync-user',401,b'{}',{'Content-Type':'application/json','x-user-token':'invalid-release-check'})
 _,row=request('/api/admin/users?limit=1',307,follow=False)
 row['pass']=row['pass'] and '/login?redirect=' in (row['location'] or '')
 request('/api/admin/users?limit=1',401,headers={'x-user-token':'invalid-release-check'},follow=False)
 request('/api/migrate',410)
 scripts=sorted(set(re.findall(rb'(/_next/static/[^"\s<>]+?\.js)',pages['/login'])))
 for raw in scripts:
  p=raw.decode();data,row=request(p,200); local=pathlib.Path('.next-production')/p.removeprefix('/_next/')
  row['sha256']=hashlib.sha256(data).hexdigest()
  row['matches_release']=local.is_file() and hashlib.sha256(local.read_bytes()).hexdigest()==row['sha256']
  row['pass']=row['pass'] and row['matches_release']
except Exception as e:
 results.append({'pass':False,'error':str(e)})
(root/'live-verification.json').write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'checks':len(results),'passed':sum(x['pass'] for x in results),'failed':[x for x in results if not x['pass']]},ensure_ascii=False))
sys.exit(0 if all(x['pass'] for x in results) else 1)
