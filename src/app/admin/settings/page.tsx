'use client';

import { useState, useEffect } from 'react';

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState('points');
  const [saving, setSaving] = useState(false);

  // 积分规则配置
  const [pointsConfig, setPointsConfig] = useState({
    inviteReward: 30,
    inviteLevel2Reward: 10,
    inviteLevel3Reward: 5,
    dailyLoginReward: 1,
    quoteReward: 2,
    uploadReward: 5,
    vipExchangePoints: 500,
    rankingDayPrice: 200,
    giftCardExchangePoints: 100,
  });

  // 排名价格配置
  const [rankingConfig, setRankingConfig] = useState([
    { position: 1, price: 1000, description: '第一名' },
    { position: 2, price: 800, description: '第二名' },
    { position: 3, price: 600, description: '第三名' },
    { position: 4, price: 400, description: '第四名' },
    { position: 5, price: 300, description: '第五名' },
    { position: 6, price: 200, description: '第六名' },
    { position: 7, price: 150, description: '第七名' },
    { position: 8, price: 100, description: '第八名' },
    { position: 9, price: 80, description: '第九名' },
    { position: 10, price: 50, description: '第十名' },
  ]);

  // 邮件模板
  const [emailTemplate, setEmailTemplate] = useState({
    welcomeSubject: '欢迎加入报个价',
    welcomeBody: '尊敬的用户，欢迎加入报个价！\n\n您可以：\n- 智能生成报价单\n- 上传产品资料\n- 邀请好友获得积分\n\n立即开始吧！',
    inviteRewardSubject: '邀请奖励通知',
    inviteRewardBody: '恭喜您！\n\n您成功邀请了一名好友，获得 {points} 积分奖励！\n\n继续邀请更多好友，获得更多奖励！',
    quoteGeneratedSubject: '报价单生成通知',
    quoteGeneratedBody: '您的报价单已生成成功！\n\n报价单号：{quoteId}\n生成时间：{time}\n\n登录查看详情。',
  });

  // 公告管理
  const [announcements, setAnnouncements] = useState([
    { id: 1, title: '系统升级通知', content: '系统将于今晚22:00-24:00进行升级，期间可能影响使用，请提前做好安排。', status: 'published', createdAt: '2024-01-15' },
    { id: 2, title: '积分规则调整', content: '从即日起，邀请好友奖励调整为每人30积分，邀请更多好友获得更多奖励！', status: 'published', createdAt: '2024-01-10' },
  ]);

  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    content: '',
    status: 'draft',
  });

  const handleSavePointsConfig = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/settings/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pointsConfig)
      });
      alert('积分规则保存成功！');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRankingConfig = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/settings/ranking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rankingConfig)
      });
      alert('排名价格保存成功！');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmailTemplate = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailTemplate)
      });
      alert('邮件模板保存成功！');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAnnouncement = () => {
    if (!newAnnouncement.title || !newAnnouncement.content) {
      alert('请填写标题和内容');
      return;
    }
    setAnnouncements([
      ...announcements,
      {
        id: Date.now(),
        ...newAnnouncement,
        createdAt: new Date().toISOString().split('T')[0]
      }
    ]);
    setNewAnnouncement({ title: '', content: '', status: 'draft' });
  };

  const handleDeleteAnnouncement = (id: number) => {
    if (!confirm('确定要删除这条公告吗？')) return;
    setAnnouncements(announcements.filter(a => a.id !== id));
  };

  const handlePublishAnnouncement = (id: number) => {
    setAnnouncements(announcements.map(a => 
      a.id === id ? { ...a, status: 'published' } : a
    ));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">系统配置</h1>

      {/* 标签页导航 */}
      <div className="border-b">
        <nav className="flex gap-4">
          {[
            { id: 'points', label: '积分规则' },
            { id: 'ranking', label: '排名价格' },
            { id: 'email', label: '邮件模板' },
            { id: 'announcement', label: '公告管理' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 积分规则配置 */}
      {activeTab === 'points' && (
        <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-gray-900">积分规则配置</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                邀请好友奖励（积分/人）
              </label>
              <input
                type="number"
                value={pointsConfig.inviteReward}
                onChange={(e) => setPointsConfig({ ...pointsConfig, inviteReward: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                二级邀请奖励（积分/人）
              </label>
              <input
                type="number"
                value={pointsConfig.inviteLevel2Reward}
                onChange={(e) => setPointsConfig({ ...pointsConfig, inviteLevel2Reward: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                三级邀请奖励（积分/人）
              </label>
              <input
                type="number"
                value={pointsConfig.inviteLevel3Reward}
                onChange={(e) => setPointsConfig({ ...pointsConfig, inviteLevel3Reward: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                每日登录奖励（积分）
              </label>
              <input
                type="number"
                value={pointsConfig.dailyLoginReward}
                onChange={(e) => setPointsConfig({ ...pointsConfig, dailyLoginReward: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                生成报价奖励（积分）
              </label>
              <input
                type="number"
                value={pointsConfig.quoteReward}
                onChange={(e) => setPointsConfig({ ...pointsConfig, quoteReward: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                上传资料奖励（积分）
              </label>
              <input
                type="number"
                value={pointsConfig.uploadReward}
                onChange={(e) => setPointsConfig({ ...pointsConfig, uploadReward: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                兑换高级会员（积分）
              </label>
              <input
                type="number"
                value={pointsConfig.vipExchangePoints}
                onChange={(e) => setPointsConfig({ ...pointsConfig, vipExchangePoints: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                排名体验价格（积分/天）
              </label>
              <input
                type="number"
                value={pointsConfig.rankingDayPrice}
                onChange={(e) => setPointsConfig({ ...pointsConfig, rankingDayPrice: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                兑换礼品卡（积分）
              </label>
              <input
                type="number"
                value={pointsConfig.giftCardExchangePoints}
                onChange={(e) => setPointsConfig({ ...pointsConfig, giftCardExchangePoints: parseInt(e.target.value) })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleSavePointsConfig}
            disabled={saving}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      )}

      {/* 排名价格配置 */}
      {activeTab === 'ranking' && (
        <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-gray-900">排名价格配置</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">排名</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">描述</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">价格（积分/天）</th>
                </tr>
              </thead>
              <tbody>
                {rankingConfig.map((item, index) => (
                  <tr key={item.position} className="border-t">
                    <td className="px-4 py-3 font-medium">第{item.position}名</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => {
                          const newConfig = [...rankingConfig];
                          newConfig[index].description = e.target.value;
                          setRankingConfig(newConfig);
                        }}
                        className="w-full p-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={item.price}
                        onChange={(e) => {
                          const newConfig = [...rankingConfig];
                          newConfig[index].price = parseInt(e.target.value);
                          setRankingConfig(newConfig);
                        }}
                        className="w-24 p-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleSaveRankingConfig}
            disabled={saving}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      )}

      {/* 邮件模板 */}
      {activeTab === 'email' && (
        <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-gray-900">邮件模板</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">欢迎邮件主题</label>
              <input
                type="text"
                value={emailTemplate.welcomeSubject}
                onChange={(e) => setEmailTemplate({ ...emailTemplate, welcomeSubject: e.target.value })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">欢迎邮件内容</label>
              <textarea
                value={emailTemplate.welcomeBody}
                onChange={(e) => setEmailTemplate({ ...emailTemplate, welcomeBody: e.target.value })}
                rows={6}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邀请奖励邮件主题</label>
              <input
                type="text"
                value={emailTemplate.inviteRewardSubject}
                onChange={(e) => setEmailTemplate({ ...emailTemplate, inviteRewardSubject: e.target.value })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邀请奖励邮件内容</label>
              <textarea
                value={emailTemplate.inviteRewardBody}
                onChange={(e) => setEmailTemplate({ ...emailTemplate, inviteRewardBody: e.target.value })}
                rows={6}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">报价单生成邮件主题</label>
              <input
                type="text"
                value={emailTemplate.quoteGeneratedSubject}
                onChange={(e) => setEmailTemplate({ ...emailTemplate, quoteGeneratedSubject: e.target.value })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">报价单生成邮件内容</label>
              <textarea
                value={emailTemplate.quoteGeneratedBody}
                onChange={(e) => setEmailTemplate({ ...emailTemplate, quoteGeneratedBody: e.target.value })}
                rows={6}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleSaveEmailTemplate}
            disabled={saving}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存模板'}
          </button>
        </div>
      )}

      {/* 公告管理 */}
      {activeTab === 'announcement' && (
        <div className="space-y-4">
          {/* 新增公告 */}
          <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
            <h2 className="text-lg font-medium text-gray-900">发布新公告</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">公告标题</label>
              <input
                type="text"
                value={newAnnouncement.title}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">公告内容</label>
              <textarea
                value={newAnnouncement.content}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                rows={4}
                className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setNewAnnouncement({ ...newAnnouncement, status: 'published' });
                  handleAddAnnouncement();
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                发布公告
              </button>
              <button
                onClick={() => {
                  setNewAnnouncement({ ...newAnnouncement, status: 'draft' });
                  handleAddAnnouncement();
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                保存草稿
              </button>
            </div>
          </div>

          {/* 公告列表 */}
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-lg font-medium text-gray-900 mb-4">公告列表</h2>
            
            <div className="space-y-3">
              {announcements.map(announcement => (
                <div key={announcement.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-gray-900">{announcement.title}</h3>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        announcement.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {announcement.status === 'published' ? '已发布' : '草稿'}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">{announcement.content}</p>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      创建时间：{announcement.createdAt}
                    </span>
                    <div className="flex gap-2">
                      {announcement.status === 'draft' && (
                        <button
                          onClick={() => handlePublishAnnouncement(announcement.id)}
                          className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          发布
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteAnnouncement(announcement.id)}
                        className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
