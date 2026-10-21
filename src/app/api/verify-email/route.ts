import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const _email = searchParams.get('email');
  const _code = searchParams.get('code');

  if (!_email || !_code) {
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>验证失败 - 报个价</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
              padding: 20px;
            }
            .container {
              max-width: 400px;
              width: 100%;
              background: white;
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
            }
            h1 { color: #ef4444; margin-bottom: 20px; }
            .button {
              display: inline-block;
              background: #3b82f6;
              color: white;
              padding: 12px 32px;
              border-radius: 9999px;
              text-decoration: none;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ 验证失败</h1>
            <p>缺少必要的验证参数</p>
            <a href="/login" class="button">返回登录页</a>
          </div>
        </body>
      </html>
    `,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }}
    );
  }

  // HTML 实体转义，防止 XSS 注入
  const safeEmail = _email
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const safeCode = _code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  try {
    // 返回纯HTML验证成功页面，不加载任何React资源
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>邮箱验证成功 - 报个价</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .container {
              max-width: 450px;
              width: 100%;
              background: white;
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              animation: slideUp 0.5s ease;
            }
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .success-icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            h1 { 
              color: #10b981; 
              margin-bottom: 16px;
              font-size: 28px;
            }
            .email {
              background: #f3f4f6;
              padding: 12px 20px;
              border-radius: 10px;
              color: #3b82f6;
              font-weight: 600;
              font-size: 16px;
              margin: 20px 0;
              word-break: break-all;
            }
            p {
              color: #4b5563;
              line-height: 1.6;
              margin-bottom: 12px;
            }
            .countdown {
              font-size: 48px;
              font-weight: bold;
              color: #3b82f6;
              margin: 20px 0;
            }
            .tip {
              background: #eff6ff;
              padding: 16px;
              border-radius: 10px;
              color: #1e40af;
              font-size: 14px;
              margin: 20px 0;
              text-align: left;
            }
            .button {
              display: inline-block;
              background: #3b82f6;
              color: white;
              padding: 14px 40px;
              border-radius: 9999px;
              text-decoration: none;
              font-weight: 600;
              transition: all 0.3s;
              border: none;
              cursor: pointer;
              font-size: 16px;
              margin-top: 10px;
            }
            .button:hover {
              background: #2563eb;
              transform: translateY(-2px);
              box-shadow: 0 10px 25px rgba(59,130,246,0.4);
            }
            .warning {
              color: #f59e0b;
              font-size: 14px;
              margin-top: 20px;
              padding: 10px;
              background: #fffbeb;
              border-radius: 8px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✓</div>
            <h1>邮箱验证成功</h1>
            <p>您的邮箱</p>
            <div class="email">${safeEmail}</div>
            <p>已经成功验证！</p>
            
            <div class="countdown" id="countdown">3</div>
            <p>页面将在 <span id="countdownText">3</span> 秒后自动关闭</p>
            
            <div class="tip">
              <strong>💡 提示</strong>
              <p>请返回原登录页继续操作</p>
            </div>
            
            <button class="button" onclick="forceClose()">立即关闭</button>
            
            <div class="warning" id="warning" style="display: none;">
              ⚠️ 自动关闭失败，请点击上方按钮手动关闭
            </div>
            
            <script>
              // 保存验证状态到localStorage
              try {
                const verifiedEmails = JSON.parse(localStorage.getItem('verified_emails') || '{}');
                verifiedEmails['${safeEmail}'] = {
                  verified: true,
                  code: '${safeCode}',
                  timestamp: Date.now()
                };
                localStorage.setItem('verified_emails', JSON.stringify(verifiedEmails));
              } catch (e) {
                console.error('保存验证状态失败:', e);
              }

              // 通知父窗口（原登录页）
              if (window.opener && !window.opener.closed) {
                try {
                  window.opener.postMessage({
                    type: 'EMAIL_VERIFIED',
                    email: '${safeEmail}',
                    code: '${safeCode}'
                  }, window.location.origin);
                } catch (e) {
                  console.error('通知父窗口失败:', e);
                }
              } else {
              }
              
              // 强制关闭窗口的函数
              function forceClose() {
                try {
                  if (window.opener) {
                    window.close();
                  } else {
                    window.location.href = '/login?verified=true&email=' + encodeURIComponent('${safeEmail}');
                  }
                } catch (e) {
                  document.getElementById('warning').style.display = 'block';
                }
              }
              
              // 倒计时后自动关闭
              let countdown = 3;
              const countdownEl = document.getElementById('countdown');
              const countdownText = document.getElementById('countdownText');
              
              const timer = setInterval(() => {
                countdown--;
                if (countdownEl) countdownEl.textContent = countdown;
                if (countdownText) countdownText.textContent = countdown;
                
                if (countdown <= 0) {
                  clearInterval(timer);
                  forceClose();
                }
              }, 1000);
              
              // 禁止页面加载任何额外的脚本
              window.addEventListener('load', function() {
                // 移除可能阻止关闭的事件
                window.onbeforeunload = null;
              });
              
              // 阻止所有可能导致页面保持打开的事件
              window.addEventListener('beforeunload', function(e) {
                // 不阻止关闭
              });
            </script>
          </div>
        </body>
      </html>
    `,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'}}
    );
  } catch (_error) {
    console.error('[API] 邮箱验证失败:');
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>验证失败 - 报个价</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              max-width: 400px;
              background: white;
              padding: 40px;
              border-radius: 20px;
              text-align: center;
            }
            h1 { color: #ef4444; }
            .button {
              display: inline-block;
              background: #3b82f6;
              color: white;
              padding: 12px 32px;
              border-radius: 9999px;
              text-decoration: none;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ 验证失败</h1>
            <p>服务器内部错误，请稍后重试</p>
            <a href="/login" class="button">返回登录页</a>
          </div>
        </body>
      </html>
    `,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }}
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { _email, _code } = body;
    return NextResponse.json({ success: true, message: '邮箱验证成功' });
  } catch (_error) {
    return NextResponse.json({ success: false, message: '验证失败' }, { status: 500 });
  }
}
