'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Share2,
  Download,
  Eye,
  Edit,
  MessageSquare,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SharedQuote } from '@/types/team';
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
import { Checkbox } from '@/components/ui/checkbox';

interface SharedQuotesListProps {
  teamId: string;
}

export function SharedQuotesList({ teamId }: SharedQuotesListProps) {
  const [sharedQuotes, setSharedQuotes] = useState<SharedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [quoteId, setQuoteId] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [canComment, setCanComment] = useState(true);
  const [canExport, setCanExport] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    fetchSharedQuotes();
  }, [teamId]);

  const fetchSharedQuotes = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/shared-quotes`, {
        headers: {
          'x-user-id': 'demo_user_1',
        },
      });
      const result = await response.json();
      if (result.success) {
        setSharedQuotes(result.data);
      }
    } catch (error) {
      console.error('获取共享报价单失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShareQuote = async () => {
    if (!quoteId.trim()) {
      alert('请输入报价单ID');
      return;
    }

    setSharing(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/shared-quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo_user_1',
        },
        body: JSON.stringify({
          quoteId,
          teamId,
          permissions: {
            canEdit,
            canComment,
            canExport,
          },
        }),
      });

      const result = await response.json();
      if (result.success) {
        setSharedQuotes([...sharedQuotes, result.data]);
        setShowShareDialog(false);
        setQuoteId('');
        alert('报价单共享成功');
      } else {
        alert(result.error || '共享失败');
      }
    } catch (error) {
      console.error('共享报价单失败:', error);
      alert('共享报价单失败');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            共享报价单
          </CardTitle>
          <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
            <DialogTrigger asChild>
              <Button>
                <Share2 className="h-4 w-4 mr-2" />
                共享报价单
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>共享报价单到团队</DialogTitle>
                <DialogDescription>
                  将报价单共享给团队成员
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="quoteId" className="text-right">
                    报价单ID
                  </Label>
                  <Input
                    id="quoteId"
                    value={quoteId}
                    onChange={(e) => setQuoteId(e.target.value)}
                    className="col-span-3"
                    placeholder="输入报价单ID"
                  />
                </div>
                <div className="col-span-4">
                  <Label className="text-sm font-medium">权限设置</Label>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="canEdit"
                        checked={canEdit}
                        onCheckedChange={(checked) => setCanEdit(checked as boolean)}
                      />
                      <Label htmlFor="canEdit" className="cursor-pointer">
                        允许编辑
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="canComment"
                        checked={canComment}
                        onCheckedChange={(checked) => setCanComment(checked as boolean)}
                      />
                      <Label htmlFor="canComment" className="cursor-pointer">
                        允许评论
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="canExport"
                        checked={canExport}
                        onCheckedChange={(checked) => setCanExport(checked as boolean)}
                      />
                      <Label htmlFor="canExport" className="cursor-pointer">
                        允许导出
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowShareDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleShareQuote} disabled={sharing}>
                  {sharing ? '共享中...' : '共享'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">加载中...</div>
          ) : sharedQuotes.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              暂无共享报价单，点击上方按钮共享
            </div>
          ) : (
            <div className="space-y-4">
              {sharedQuotes.map((quote) => (
                <div
                  key={quote.id}
                  className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <span className="font-medium">
                        报价单 {quote.quoteId}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 flex items-center space-x-4">
                      <span className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        {new Date(quote.sharedAt).toLocaleDateString('zh-CN')}
                      </span>
                      <span className="flex items-center">
                        <MessageSquare className="h-4 w-4 mr-1" />
                        共享者: {quote.sharedBy}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quote.permissions.canEdit && (
                        <Badge variant="secondary" className="text-xs">
                          <Edit className="h-3 w-3 mr-1" />
                          可编辑
                        </Badge>
                      )}
                      {quote.permissions.canComment && (
                        <Badge variant="secondary" className="text-xs">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          可评论
                        </Badge>
                      )}
                      {quote.permissions.canExport && (
                        <Badge variant="secondary" className="text-xs">
                          <Download className="h-3 w-3 mr-1" />
                          可导出
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4 mr-1" />
                      查看
                    </Button>
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
