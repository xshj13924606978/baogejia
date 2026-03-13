'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Users, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Team } from '@/types/team';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function TeamPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const response = await fetch('/api/teams', {
        headers: {
          'x-user-id': 'demo_user_1',
        },
      });
      const result = await response.json();
      if (result.success) {
        setTeams(result.data);
      }
    } catch (error) {
      console.error('获取团队列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      alert('请输入团队名称');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo_user_1',
        },
        body: JSON.stringify({
          name: teamName,
          description: teamDescription,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setTeams([...teams, result.data]);
        setShowCreateDialog(false);
        setTeamName('');
        setTeamDescription('');
      } else {
        alert(result.error || '创建团队失败');
      }
    } catch (error) {
      console.error('创建团队失败:', error);
      alert('创建团队失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="text-2xl font-bold text-gray-900">
                报个价
              </Link>
              <span className="ml-4 text-gray-600">团队协作</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost">返回首页</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题和操作按钮 */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">我的团队</h1>
            <p className="mt-2 text-gray-600">管理和协作您的团队</p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="flex items-center space-x-2">
                <Plus className="h-5 w-5" />
                <span>创建团队</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>创建新团队</DialogTitle>
                <DialogDescription>创建一个团队来与您的团队成员协作</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    团队名称
                  </Label>
                  <Input
                    id="name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="col-span-3"
                    placeholder="输入团队名称"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right">
                    团队描述
                  </Label>
                  <Textarea
                    id="description"
                    value={teamDescription}
                    onChange={(e) => setTeamDescription(e.target.value)}
                    className="col-span-3"
                    placeholder="输入团队描述（可选）"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleCreateTeam} disabled={creating}>
                  {creating ? '创建中...' : '创建'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* 团队列表 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-4 text-gray-600">加载中...</p>
          </div>
        ) : teams.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">还没有团队</h3>
              <p className="text-gray-600 mb-6">创建一个团队来开始协作</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-5 w-5 mr-2" />
                创建第一个团队
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <Card key={team.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">
                        <Link
                          href={`/team/${team.id}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          {team.name}
                        </Link>
                      </CardTitle>
                      <CardDescription className="line-clamp-2">
                        {team.description || '暂无描述'}
                      </CardDescription>
                    </div>
                    <div className="ml-4 flex flex-col items-end">
                      <div className="flex items-center text-sm text-gray-600 mb-1">
                        <Users className="h-4 w-4 mr-1" />
                        <span>{team.memberCount}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>创建于 {new Date(team.createdAt).toLocaleDateString('zh-CN')}</span>
                    <Link href={`/team/${team.id}`} className="text-blue-600 hover:text-blue-700">
                      查看详情 →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
