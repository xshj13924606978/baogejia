'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Reply, Trash2, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Comment } from '@/types/team';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CommentSectionProps {
  teamId: string;
  targetType: 'quote' | 'team' | 'proposal';
}

export function CommentSection({ teamId, targetType }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    fetchComments();
  }, [teamId]);

  const fetchComments = async () => {
    try {
      const response = await fetch(`/api/comments?targetId=${teamId}`, {
        headers: {
          'x-user-id': 'demo_user_1',
        },
      });
      const result = await response.json();
      if (result.success) {
        setComments(result.data);
      }
    } catch (error) {
      console.error('获取评论失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo_user_1',
          'x-user-name': '演示用户',
        },
        body: JSON.stringify({
          targetId: teamId,
          targetType,
          content: newComment,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setComments([...comments, result.data]);
        setNewComment('');
      } else {
        alert(result.error || '发表评论失败');
      }
    } catch (error) {
      console.error('发表评论失败:', error);
      alert('发表评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (commentId: string) => {
    if (!replyContent.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo_user_1',
          'x-user-name': '演示用户',
        },
        body: JSON.stringify({
          targetId: teamId,
          targetType,
          content: replyContent,
          parentId: commentId,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // 刷新评论列表
        fetchComments();
        setReplyingTo(null);
        setReplyContent('');
      } else {
        alert(result.error || '发表回复失败');
      }
    } catch (error) {
      console.error('发表回复失败:', error);
      alert('发表回复失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('确定要删除这条评论吗？')) return;

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': 'demo_user_1',
        },
      });

      const result = await response.json();
      if (result.success) {
        setComments(comments.filter(c => c.id !== commentId));
      } else {
        alert(result.error || '删除评论失败');
      }
    } catch (error) {
      console.error('删除评论失败:', error);
      alert('删除评论失败');
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editContent.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo_user_1',
        },
        body: JSON.stringify({
          content: editContent,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setComments(
          comments.map(c => (c.id === commentId ? { ...c, content: editContent } : c))
        );
        setEditingComment(null);
        setEditContent('');
      } else {
        alert(result.error || '更新评论失败');
      }
    } catch (error) {
      console.error('更新评论失败:', error);
      alert('更新评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <div
      key={comment.id}
      className={`${isReply ? 'ml-12 mt-2' : 'mt-4'} p-4 bg-gray-50 rounded-lg`}
    >
      <div className="flex items-start space-x-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback>
            {comment.userName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="font-medium text-sm">{comment.userName}</span>
            <span className="text-xs text-gray-500">
              {new Date(comment.createdAt).toLocaleString('zh-CN')}
            </span>
            {editingComment !== comment.id && (
              <div className="flex items-center space-x-2 ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(comment.id)}
                  className="h-6 px-2 text-xs"
                >
                  <Reply className="h-3 w-3 mr-1" />
                  回复
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingComment(comment.id);
                    setEditContent(comment.content);
                  }}
                  className="h-6 px-2 text-xs"
                >
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteComment(comment.id)}
                  className="h-6 px-2 text-xs text-red-600"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  删除
                </Button>
              </div>
            )}
          </div>

          {editingComment === comment.id ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
              />
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  onClick={() => handleEditComment(comment.id)}
                  disabled={submitting}
                >
                  {submitting ? '保存中...' : '保存'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingComment(null)}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {comment.content}
            </p>
          )}

          {replyingTo === comment.id && (
            <div className="mt-3 space-y-2">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`回复 ${comment.userName}...`}
                rows={2}
              />
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  onClick={() => handleSubmitReply(comment.id)}
                  disabled={submitting}
                >
                  {submitting ? '发表中...' : '发表回复'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReplyingTo(null)}
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-3 space-y-2">
              {comment.replies.map((reply) => renderComment(reply, true))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      {/* 发表评论 */}
      <div className="space-y-3">
        <div className="flex items-start space-x-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>我</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="发表您的评论..."
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || submitting}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {submitting ? '发表中...' : '发表评论'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 评论列表 */}
      <div className="border-t pt-4">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            暂无评论，发表第一条评论吧
          </div>
        ) : (
          <div className="space-y-2">
            {comments.map((comment) => renderComment(comment))}
          </div>
        )}
      </div>
    </div>
  );
}
