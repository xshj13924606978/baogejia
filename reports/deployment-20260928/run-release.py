import subprocess,pathlib,json,hashlib,shlex,sys
root=pathlib.Path('reports/deployment-20260928'); meta=json.loads((root/'release.json').read_text()); mode=sys.argv[1]
assert mode in ('prepare','activate','rollback')
ssh=['/mnt/c/Windows/System32/OpenSSH/ssh.exe','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-i',r'C:\Users\兴燊环境\.ssh\id_rsa','ubuntu@193.112.123.218']
script=(root/'release-remote.sh').read_bytes(); digest=hashlib.sha256(script).hexdigest(); target='/home/ubuntu/apps/quote-project/releases/'+meta['release']+'.verified.sh'
if mode=='prepare':
 command='umask 077; test ! -e '+shlex.quote(target)+' && cat > '+shlex.quote(target)
 r=subprocess.run(ssh+[command],input=script,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
 if r.returncode:raise SystemExit('Reviewed script upload failed')
command='echo '+shlex.quote(digest+'  '+target)+' | sha256sum -c - && bash '+shlex.quote(target)+' '+shlex.join([mode,meta['release'],meta['sha256'],meta['build_id']])
with (root/(mode+'.txt')).open('wb') as log:
 r=subprocess.run(ssh+[command],stdout=log,stderr=subprocess.STDOUT,timeout=240)
print(mode,'exit',r.returncode)
print((root/(mode+'.txt')).read_text()[-3500:])
sys.exit(r.returncode)
