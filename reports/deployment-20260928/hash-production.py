import pathlib,hashlib,json
r=pathlib.Path('/home/ubuntu/apps/quote-project/quote-app')
files={}
for start in [r/'server.js',r/'package.json',r/'.next-production/server',r/'.next-production/BUILD_ID',r/'.next-production/required-server-files.json']:
 items=start.rglob('*') if start.is_dir() else [start]
 for p in items:
  if p.is_file() and not p.is_symlink(): files[str(p.relative_to(r))]=hashlib.sha256(p.read_bytes()).hexdigest()
print(json.dumps({'files':files,'top_level':[{'name':p.name,'is_dir':p.is_dir(),'is_symlink':p.is_symlink()} for p in r.iterdir() if not p.name.startswith('.env')]}))
