import subprocess,pathlib,json,shlex
r=pathlib.Path('reports/deployment-20260928'); meta=json.loads((r/'release.json').read_text())
ssh=['/mnt/c/Windows/System32/OpenSSH/ssh.exe','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-i',r'C:\Users\兴燊环境\.ssh\id_rsa','ubuntu@193.112.123.218']
base='/home/ubuntu/apps/quote-project/releases'; name=meta['release']
for source,target in [(pathlib.Path(meta['package']),base+'/'+name+'.tgz'),(r/'release-remote.sh',base+'/'+name+'.sh')]:
 command='umask 077; mkdir -p '+shlex.quote(base)+' && test ! -e '+shlex.quote(target)+' && cat > '+shlex.quote(target+'.part')+' && mv '+shlex.quote(target+'.part')+' '+shlex.quote(target)
 with source.open('rb') as f:
  result=subprocess.run(ssh+[command],stdin=f,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=360)
 if result.returncode: raise SystemExit('Upload failed: '+str(result.returncode))
 print('Uploaded '+source.name,flush=True)
print('UPLOAD_PASS')
