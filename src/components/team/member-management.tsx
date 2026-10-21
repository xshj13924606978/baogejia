'use client';

import { confirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { UserPlus, Mail, Crown, Shield, User, MoreVertical, UserMinus, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TeamMember, TeamRole } from '@/types/team';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

interface MemberManagementProps {
  teamId: string;
  teamOwnerId: string;
}

export function MemberManagement({ teamId, teamOwnerId }: MemberManagementProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>(TeamRole.MEMBER);
  const [inviting, setInviting] = useState(false);
  // 邀请成功后生成的邀请链接（含一次性 token），供复制发送给受邀人
  const [inviteLinks, setInviteLinks] = useState<Array<{ email: string; url: string }>>([]);

  useEffect(() => {
    fetchMembers();
  }, [teamId]);

  const fetchMembers = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/members`);
      const result = await response.json();
      if (result.success) {
        setMembers(result.data);
      }
    } catch (error) {
      console.error('获取成员列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    const emails = inviteEmails
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (emails.length === 0) {
      toast('请输入至少一个邮箱地址');
      return;
    }

    setInviting(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emails,
          role: inviteRole,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // #[20260902-0900] 邀请闭环：后端返回一次性 token，前端拼成可复制的邀请链接
        const links = (result.data || [])
          .filter((inv: any) => inv?.token)
          .map((inv: any) => ({
            email: String(inv.inviteeEmail || ''),
            url: `${window.location.origin}/team/join?token=${inv.token}`,
          }));
        setInviteLinks(links);
        toast(
          links.length > 0
            ? `已生成 ${links.length} 个邀请链接，请复制发送给受邀人`
            : '邀请已发送（受邀人已是成员或已有待处理邀请）'
        );
        setInviteEmails('');
      } else {
        toast(result.error || '邀请失败');
      }
    } catch (error) {
      console.error('邀请失败:', error);
      toast('邀请失败');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: TeamRole) => {
    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      const result = await response.json();
      if (result.success) {
        // #[20260902-0900] 后端 memberId 语义为 userId，本地状态也按 userId 匹配
        setMembers(members.map((m) => (m.userId === memberId ? { ...m, role: newRole } : m)));
      } else {
        toast(result.error || '更新角色失败');
      }
    } catch (error) {
      console.error('更新角色失败:', error);
      toast('更新角色失败');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!await confirmDialog({ title: '确定要移除该成员吗？', destructive: true })) {
      return;
    }

    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (result.success) {
        // #[20260902-0900] 后端 memberId 语义为 userId，本地状态也按 userId 匹配
        setMembers(members.filter((m) => m.userId !== memberId));
      } else {
        toast(result.error || '移除成员失败');
      }
    } catch (error) {
      console.error('移除成员失败:', error);
      toast('移除成员失败');
    }
  };

  const getRoleIcon = (role: TeamRole) => {
    switch (role) {
      case TeamRole.ADMIN:
        return <Crown className="h-4 w-4 text-yellow-600" />;
      case TeamRole.MEMBER:
        return <Shield className="h-4 w-4 text-blue-600" />;
      case TeamRole.GUEST:
        return <User className="h-4 w-4 text-gray-600" />;
    }
  };

  const getRoleBadge = (role: TeamRole) => {
    switch (role) {
      case TeamRole.ADMIN:
        return <Badge variant="destructive">管理员</Badge>;
      case TeamRole.MEMBER:
        return <Badge variant="default">成员</Badge>;
      case TeamRole.GUEST:
        return <Badge variant="secondary">访客</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>成员列表</CardTitle>
          <Dialog
            open={showInviteDialog}
            onOpenChange={(open) => {
              setShowInviteDialog(open);
              // 关闭弹窗时清空已生成的邀请链接，避免下次打开仍展示旧链接
              if (!open) setInviteLinks([]);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                邀请成员
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>邀请成员加入团队</DialogTitle>
                <DialogDescription>输入邮箱地址邀请成员加入团队</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="emails" className="text-right">
                    邮箱地址
                  </Label>
                  <Input
                    id="emails"
                    value={inviteEmails}
                    onChange={(e) => setInviteEmails(e.target.value)}
                    className="col-span-3"
                    placeholder="多个邮箱用逗号分隔"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="role" className="text-right">
                    角色
                  </Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as TeamRole)}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TeamRole.ADMIN}>管理员</SelectItem>
                      <SelectItem value={TeamRole.MEMBER}>成员</SelectItem>
                      <SelectItem value={TeamRole.GUEST}>访客</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* #[20260902-0900] 邀请链接（含一次性 token），复制后发送给受邀人 */}
                {inviteLinks.length > 0 && (
                  <div className="space-y-2 rounded-md border bg-slate-50 p-3">
                    <div className="text-sm font-medium">
                      邀请链接（7 天内有效，请复制发送给受邀人）
                    </div>
                    {inviteLinks.map((link) => (
                      <div key={link.url} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                          {link.email || link.url}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(link.url);
                              toast('邀请链接已复制到剪贴板');
                            } catch {
                              toast('复制失败，请手动选择链接复制');
                            }
                          }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          复制链接
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleInvite} disabled={inviting}>
                  {inviting ? '发送中...' : '发送邀请'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">加载中...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-gray-600">暂无成员，点击上方按钮邀请</div>
          ) : (
            <div className="space-y-4">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <Avatar>
                      <AvatarFallback>
                        {member.nickname?.[0] || member.userId[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">
                          {member.nickname || `用户${member.userId.substring(0, 6)}`}
                        </span>
                        {getRoleBadge(member.role)}
                        {member.userId === teamOwnerId && <Badge variant="outline">创建者</Badge>}
                      </div>
                      <div className="text-sm text-gray-600 flex items-center mt-1">
                        <Mail className="h-3 w-3 mr-1" />
                        {member.email || '未设置邮箱'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getRoleIcon(member.role)}
                    {member.userId !== teamOwnerId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>成员操作</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs text-gray-500">
                            修改角色
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => handleUpdateRole(member.userId, TeamRole.ADMIN)}
                          >
                            <Crown className="h-4 w-4 mr-2" />
                            设为管理员
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleUpdateRole(member.userId, TeamRole.MEMBER)}
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            设为成员
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleUpdateRole(member.userId, TeamRole.GUEST)}
                          >
                            <User className="h-4 w-4 mr-2" />
                            设为访客
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleRemoveMember(member.userId)}
                            className="text-red-600"
                          >
                            <UserMinus className="h-4 w-4 mr-2" />
                            移除成员
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
