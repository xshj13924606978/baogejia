'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  UserPlus,
  Settings,
  MessageSquare,
  Share2,
  FileText,
  Crown,
  Shield,
  UserMinus,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Team, TeamMember, TeamRole, TeamStats } from '@/types/team';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { CommentSection } from '@/components/team/comment-section';
import { MemberManagement } from '@/components/team/member-management';
import { PermissionManagement } from '@/components/team/permission-management';
import { SharedQuotesList } from '@/components/team/shared-quotes-list';

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (teamId) {
      fetchTeamDetails();
      fetchTeamStats();
    }
  }, [teamId]);

  const fetchTeamDetails = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}`, {
        headers: {
          'x-user-id': 'demo_user_1',
        },
      });
      const result = await response.json();
      if (result.success) {
        setTeam(result.data);
      } else {
        alert(result.error || '获取团队详情失败');
        router.push('/team');
      }
    } catch (error) {
      console.error('获取团队详情失败:', error);
      router.push('/team');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamStats = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/stats`, {
        headers: {
          'x-user-id': 'demo_user_1',
        },
      });
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('获取团队统计失败:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="text-center py-8">
            <p className="text-gray-600 mb-4">团队不存在或无权访问</p>
            <Button onClick={() => router.push('/team')}>返回团队列表</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/team">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{team.name}</h1>
                <p className="text-sm text-gray-600">{team.description || '暂无描述'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Link href="/">
                <Button variant="ghost">返回首页</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 团队统计 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总成员数</CardTitle>
                <Users className="h-4 w-4 text-gray-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalMembers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">活跃成员</CardTitle>
                <Users className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeMembers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">共享报价单</CardTitle>
                <FileText className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalQuotes}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">评论总数</CardTitle>
                <MessageSquare className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalComments}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 功能选项卡 */}
        <Tabs defaultValue="members" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="members">
              <Users className="h-4 w-4 mr-2" />
              成员管理
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <Shield className="h-4 w-4 mr-2" />
              权限管理
            </TabsTrigger>
            <TabsTrigger value="quotes">
              <FileText className="h-4 w-4 mr-2" />
              共享报价单
            </TabsTrigger>
            <TabsTrigger value="comments">
              <MessageSquare className="h-4 w-4 mr-2" />
              评论系统
            </TabsTrigger>
          </TabsList>

          {/* 成员管理 */}
          <TabsContent value="members">
            <MemberManagement teamId={teamId} teamOwnerId={team.ownerId} />
          </TabsContent>

          {/* 权限管理 */}
          <TabsContent value="permissions">
            <PermissionManagement teamId={teamId} />
          </TabsContent>

          {/* 共享报价单 */}
          <TabsContent value="quotes">
            <SharedQuotesList teamId={teamId} />
          </TabsContent>

          {/* 评论系统 */}
          <TabsContent value="comments">
            <Card>
              <CardHeader>
                <CardTitle>团队评论</CardTitle>
                <CardDescription>
                  查看和管理团队中的评论
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CommentSection teamId={teamId} targetType="team" />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
