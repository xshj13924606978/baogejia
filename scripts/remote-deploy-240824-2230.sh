#!/bin/bash
# #20260824-2230 部署产品导入多轮修复到生产服务器（腾讯云 VM-0-4-ubuntu）
set -e
cd /home/ubuntu/apps/quote-project
TS=20260824-2230
echo "== [1/5] backup old quote-app =="
rm -rf quote-app.bak-$TS
mv quote-app quote-app.bak-$TS
echo "== [2/5] extract new build =="
mkdir quote-app
tar xzf /tmp/quote-standalone-20260824-2133.tgz -C quote-app
echo "== [3/5] restore server .env.production =="
cp quote-app.bak-$TS/.env.production quote-app/.env.production
ls quote-app/ | head -15
echo "== [4/5] pm2 restart quote-app =="
pm2 restart quote-app --update-env
sleep 3
pm2 status quote-app
echo "== [5/5] local 5000 check =="
curl -s -o /dev/null -w "register=%{http_code}\n" http://127.0.0.1:5000/register
curl -s -o /dev/null -w "login=%{http_code}\n" http://127.0.0.1:5000/login
echo "== page content assert =="
curl -s http://127.0.0.1:5000/register | grep -oE "仅需手机号\+验证码|手机号|验证码" | sort | uniq -c
echo "DEPLOY_DONE"
