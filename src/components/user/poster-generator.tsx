'use client';

import { useState, useRef } from 'react';
import { toPng } from 'html-to-image';
import { QRCodeCanvas as QRCode } from 'qrcode.react';

interface PosterProps {
  user: any;
  inviteCode: string;
  onClose: () => void;
}

export default function PosterGenerator({ user, inviteCode, onClose }: PosterProps) {
  const [style, setStyle] = useState('simple');
  const [background, setBackground] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  // 修复二维码URL：确保使用正确的域名
  const inviteLink = `${typeof window !== 'undefined' ? window.location.origin : 'https://baojia.com'}/register?code=${inviteCode}`;

  // 风格配置
  const styles = {
    simple: {
      name: '简约风格',
      bg: 'bg-gradient-to-br from-white to-gray-50',
      title: 'text-blue-600',
      text: 'text-gray-700',
      button: 'bg-blue-500',
      border: 'border-gray-200',
      qrContainer: 'bg-white',
    },
    festive: {
      name: '喜庆风格',
      bg: 'bg-gradient-to-br from-red-500 to-red-600',
      title: 'text-yellow-300',
      text: 'text-white',
      button: 'bg-yellow-500 text-red-700',
      border: 'border-yellow-300',
      qrContainer: 'bg-white',
    },
    business: {
      name: '商务风格',
      bg: 'bg-gradient-to-br from-blue-900 to-purple-900',
      title: 'text-white',
      text: 'text-gray-200',
      button: 'bg-gradient-to-r from-blue-400 to-purple-400',
      border: 'border-purple-400',
      qrContainer: 'bg-white',
    },
  };

  const currentStyle = styles[style as keyof typeof styles];

  // 下载海报 - 修复统计功能
  const downloadPoster = async () => {
    if (!posterRef.current) return;

    try {
      setDownloading(true);

      const dataUrl = await toPng(posterRef.current, {
        quality: 0.95,
        canvasWidth: 600,
        canvasHeight: 800,
        pixelRatio: 2, // 提高清晰度
      });

      // 先下载图片
      const link = document.createElement('a');
      link.download = `邀请海报-${user?.username || 'user'}.png`;
      link.href = dataUrl;
      link.click();

      // 异步记录下载统计（不阻塞用户操作）
      if (user?.id) {
        fetch('/api/stats/poster-download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ style, user_id: user.id }),
        }).catch(err => {
          console.error('下载统计记录失败:', err);
        });
      }

      alert('海报下载成功！');
    } catch (error) {
      console.error('下载海报失败:', error);
      alert('下载失败，请重试');
    } finally {
      setDownloading(false);
    }
  };

  // 上传背景图
  const uploadBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 限制文件大小（2MB）
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过2MB');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setBackground(evt.target?.result as string);
        setUploading(false);
      };
      reader.onerror = () => {
        alert('图片读取失败');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('背景上传失败:', error);
      alert('图片处理失败');
      setUploading(false);
    }
  };

  // 分享到微信 - 修复并发错误
  const shareToWechat = async () => {
    if (!posterRef.current || sharing) return; // 添加状态锁防止并发

    try {
      setSharing(true);

      const dataUrl = await toPng(posterRef.current, {
        quality: 0.95,
        canvasWidth: 600,
        canvasHeight: 800,
        pixelRatio: 2,
      });

      // 将base64转换为Blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], '邀请海报.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: '邀请好友加入智能报价系统',
          text: '邀请好友赚积分，30分/人！',
          files: [file],
        });

        // 记录分享统计
        if (user?.id) {
          fetch('/api/stats/poster-download', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: user.id, style }),
          }).catch(err => {
            console.error('分享统计记录失败:', err);
          });
        }
      } else {
        // 降级方案：下载后提示手动分享
        alert('您的浏览器不支持直接分享，海报已下载，请手动分享');
        const link = document.createElement('a');
        link.download = `邀请海报-${user?.username || 'user'}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (error) {
      console.error('分享失败:', error);
      if ((error as Error).name !== 'AbortError') {
        alert('分享失败，请重试');
      }
    } finally {
      setSharing(false);
    }
  };

  // 清除背景
  const clearBackground = () => {
    setBackground(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl p-6 max-h-[90vh] overflow-auto">
        {/* 标题栏 */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
              aria-label="返回"
            >
              <span className="text-lg">←</span>
              <span className="text-sm">返回</span>
            </button>
            <h2 className="text-xl font-bold">🎨 生成邀请海报</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl transition-colors"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：海报预览 */}
          <div>
            <h3 className="font-medium mb-2">预览</h3>
            <div
              ref={posterRef}
              className={`${currentStyle.bg} p-6 rounded-xl shadow-lg border ${currentStyle.border} aspect-[3/4] flex flex-col relative overflow-hidden`}
              style={
                background
                  ? {
                      backgroundImage: `url(${background})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : {}
              }
            >
              {/* 头部 */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-2xl shadow-md flex-shrink-0 overflow-hidden">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt="头像"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl">👤</span>
                  )}
                </div>
                <div>
                  <div className={`font-bold text-lg ${currentStyle.title}`}>
                    {user?.username || '用户'}
                  </div>
                  <div className={`text-sm ${currentStyle.text}`}>
                    邀请您加入
                  </div>
                </div>
              </div>

              {/* 中间文案 */}
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className={`text-3xl font-bold mb-2 ${currentStyle.title}`}>
                  智能报价系统
                </div>
                <div className={`text-base mb-6 ${currentStyle.text}`}>
                  让报价更简单
                </div>

                {/* 二维码 */}
                <div className={`${currentStyle.qrContainer} p-3 rounded-xl shadow-md mb-3`}>
                  <QRCode value={inviteLink} size={140} level="H" />
                </div>

                {/* 宣传语 */}
                <div
                  className={`text-sm font-medium px-4 py-2 rounded-full ${
                    style === 'simple'
                      ? 'bg-blue-100 text-blue-700'
                      : style === 'festive'
                      ? 'bg-yellow-400 text-red-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  🎁 邀请好友赚积分，30分/人
                </div>
              </div>

              {/* 底部 */}
              <div
                className={`text-xs text-center mt-4 ${currentStyle.text} opacity-70`}
              >
                长按保存图片，分享给好友
              </div>

              {/* 品牌LOGO（右下角） */}
              <div className="absolute bottom-3 right-3">
                <div className={`text-xs ${currentStyle.text} opacity-60`}>
                  © 智能报价系统
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：设置选项 */}
          <div>
            <h3 className="font-medium mb-3">样式设置</h3>

            {/* 风格选择 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                onClick={() => setStyle('simple')}
                className={`p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                  style === 'simple'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                aria-label="简约风格"
              >
                🎯 简约
              </button>
              <button
                onClick={() => setStyle('festive')}
                className={`p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                  style === 'festive'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                aria-label="喜庆风格"
              >
                🎉 喜庆
              </button>
              <button
                onClick={() => setStyle('business')}
                className={`p-3 border-2 rounded-lg text-sm font-medium transition-all ${
                  style === 'business'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                aria-label="商务风格"
              >
                💼 商务
              </button>
            </div>

            {/* 背景图上传 */}
            <div className="mb-4">
              <div className="text-sm font-medium mb-2">背景图（可选）</div>
              <label className="block w-full p-4 border-2 border-dashed rounded-lg text-center cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={uploadBackground}
                  className="hidden"
                  disabled={uploading}
                />
                {uploading ? (
                  <div className="text-gray-500">
                    <div className="animate-spin inline-block mr-2">⏳</div>
                    上传中...
                  </div>
                ) : (
                  <div className="text-gray-600">
                    <div className="text-2xl mb-1">📷</div>
                    <div className="text-sm">点击上传自定义背景</div>
                    <div className="text-xs text-gray-400 mt-1">
                      支持 JPG/PNG，最大2MB
                    </div>
                  </div>
                )}
              </label>
              {background && (
                <button
                  onClick={clearBackground}
                  className="mt-2 text-xs text-red-600 hover:text-red-700 transition-colors"
                >
                  清除背景
                </button>
              )}
            </div>

            {/* 预览二维码 */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium mb-2">二维码预览</div>
              <div className="flex justify-center bg-white p-3 rounded-lg">
                <QRCode value={inviteLink} size={100} level="H" />
              </div>
              <div className="text-xs text-center text-gray-500 mt-2 break-all">
                {inviteLink}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={downloadPoster}
                disabled={downloading}
                className="py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                aria-label="下载海报"
              >
                {downloading ? (
                  <span className="flex items-center justify-center">
                    <span className="animate-spin mr-2">⏳</span>
                    生成中...
                  </span>
                ) : (
                  '📥 下载海报'
                )}
              </button>
              <button
                onClick={shareToWechat}
                disabled={sharing}
                className="py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                aria-label="分享海报"
              >
                {sharing ? (
                  <span className="flex items-center justify-center">
                    <span className="animate-spin mr-2">⏳</span>
                    分享中...
                  </span>
                ) : (
                  '📤 分享海报'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 使用统计 */}
        <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
          <div className="text-sm font-medium mb-2">📊 海报生成统计</div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">23</div>
              <div className="text-gray-600 text-xs">今日生成</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">15</div>
              <div className="text-gray-600 text-xs">今日下载</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">32%</div>
              <div className="text-gray-600 text-xs">分享转化</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
