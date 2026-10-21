const fs=require('fs'),cp=require('child_process'),{parseEnv}=require('node:util');
const env=parseEnv(fs.readFileSync('/home/ubuntu/apps/quote-project/quote-app/.env.production','utf8'));
const p=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(x=>x.name==='quote-app').pm2_env;
const differences=Object.keys(env).filter(k=>p[k]!==undefined && String(p[k])!==env[k]);
console.log(JSON.stringify({environment_conflicting_keys:differences}));
