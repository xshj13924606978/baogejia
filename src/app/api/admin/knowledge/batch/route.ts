import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { pointsService } from '@/lib/points-service';
import { ensureEntryEmbedding } from '@/lib/knowledge/embedding-service';
import { addAuditLog } from '@/lib/knowledge/audit-log';

/**
 * 知识库批量操作 API
 *
 * POST /api/admin/knowledge/batch
 * Body: { ids: string[], action: 'approve' | 'reject' | 'delete', reason?: string }
 *
 * - approve: 批量通过审核（触发向量化 + 积分奖励）
 * - reject:  批量驳回（需 reason）
 * - delete:  批量删除
 *
 * 单条失败不影响其他条目，返回每条的执行结果。
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { ids, action, reason } = body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: '请选择要操作的条目' }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ success: false, error: '单次最多操作 100 条' }, { status: 400 });
    }
    if (!['approve', 'reject', 'delete', 'reset'].includes(action)) {
      return NextResponse.json({ success: false, error: '无效的批量操作类型' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const now = new Date().toISOString();

    const results = {
      action,
      updated: 0,
      failed: [] as { id: string; reason: string }[],
    };

    for (const id of ids) {
      try {
        if (action === 'delete') {
          const { data: item } = await db
            .from('knowledge_entries')
            .select('id, title, file_key')
            .eq('id', id)
            .maybeSingle();

          if (!item) {
            results.failed.push({ id, reason: '条目不存在' });
            continue;
          }

          // 删除前写审计日志（尽量保留记录）
          await addAuditLog(
            id,
            'delete',
            user.id,
            { title: item.title, via: 'batch' },
            reason || '批量删除'
          );

          const { error: delErr } = await db.from('knowledge_entries').delete().eq('id', id);
          if (delErr) throw delErr;

          // 清理存储文件（失败不阻断）
          if (item.file_key) {
            try {
              await db.storage.from('knowledge-base').remove([item.file_key]);
            } catch {
              /* ignore */
            }
          }

          results.updated += 1;
          continue;
        }

        const { data: before } = await db
          .from('knowledge_entries')
          .select('id, title, status, user_id, type')
          .eq('id', id)
          .maybeSingle();

        if (!before) {
          results.failed.push({ id, reason: '条目不存在' });
          continue;
        }

        if (action === 'approve') {
          const { error } = await db
            .from('knowledge_entries')
            .update({
              status: 'approved',
              reviewed_by: user.id,
              reviewed_at: now,
              reject_reason: null,
              updated_at: now,
            })
            .eq('id', id);
          if (error) throw error;

          // 从非 approved 变为 approved 时奖励上传者积分（避免重复奖励）
          if (before.status !== 'approved' && before.user_id) {
            try {
              const { data: rule } = await db
                .from('points_rules')
                .select('*')
                .eq('rule_key', 'knowledge_upload_reward')
                .eq('is_active', true)
                .single();

              const rewardPoints = rule ? rule.rule_config?.points || rule.base_points || 20 : 20;

              await pointsService.addPoints(
                before.user_id,
                rewardPoints,
                'task_reward',
                `知识库文件「${before.title}」批量审核通过奖励`
              );
            } catch (rewardErr: any) {
              console.warn('[KnowledgeBatch] 积分奖励失败（不影响审核）:', rewardErr?.message);
            }
          }

          await addAuditLog(
            id,
            'batch_approve',
            user.id,
            {
              title: before.title,
              from_status: before.status,
              to_status: 'approved',
              via: 'batch',
            },
            reason
          );

          // 批量通过 → 触发向量化（失败不影响审核结果）
          try {
            await ensureEntryEmbedding(db, id);
          } catch (embedErr: any) {
            console.warn(
              `[KnowledgeBatch] 条目 ${id} 向量化失败（不影响审核）:`,
              embedErr?.message
            );
          }
        } else if (action === 'reset') {
          // 重置为待审核（清空审核记录，支持重新审核）
          const { error } = await db
            .from('knowledge_entries')
            .update({
              status: 'pending',
              reviewed_by: null,
              reviewed_at: null,
              reject_reason: null,
              updated_at: now,
            })
            .eq('id', id);
          if (error) throw error;

          await addAuditLog(
            id,
            'batch_reset',
            user.id,
            { title: before.title, from_status: before.status, to_status: 'pending', via: 'batch' },
            reason || '重置为待审核'
          );
        } else {
          // reject
          const { error } = await db
            .from('knowledge_entries')
            .update({
              status: 'rejected',
              reviewed_by: user.id,
              reviewed_at: now,
              reject_reason: reason || '未通过审核',
              updated_at: now,
            })
            .eq('id', id);
          if (error) throw error;

          await addAuditLog(
            id,
            'batch_reject',
            user.id,
            {
              title: before.title,
              from_status: before.status,
              to_status: 'rejected',
              via: 'batch',
            },
            reason || '未通过审核'
          );
        }

        results.updated += 1;
      } catch (err: any) {
        console.warn(`[KnowledgeBatch] 条目 ${id} 处理失败:`, err?.message);
        results.failed.push({ id, reason: err?.message || '处理失败' });
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('[KnowledgeBatch] 批量操作异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
