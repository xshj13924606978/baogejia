'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Shield, Loader2, Plus, Trash2, Save, User, Crown, Users, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';

const API = '/api/admin/permission-overrides';
const USERS_API = '/api/admin/users';

// ── 类型 ──

interface PermRule {
  id: string;
  target_type: string;
  target_id: string;
  permission_type: string;
  permission_key: string;
  is_visible: boolean | null;
  is_editable: boolean | null;
  priority: number;
  created_at: string;
}

interface TreeNode {
  key: string;
  label: string;
  type: 'module' | 'page' | 'field' | 'action' | 'user_menu' | 'user_menu_page' | 'user_menu_field' | 'user_menu_action';
  category?: 'system' | 'user_menu';
  children?: TreeNode[];
  defaultVisible?: boolean;
  defaultEditable?: boolean;
  override?: { visible?: boolean; editable?: boolean };
}

const TARGET_TYPES = [
  { value: 'user', label: '按用户', icon: User, priority: 5 },
  { value: 'role', label: '按角色', icon: Users, priority: 10 },
  { value: 'level', label: '按等级', icon: Crown, priority: 20 },
];

const ROLES = [
  { value: 'super_admin', label: '超级管理员' },
  { value: 'admin', label: '管理员' },
  { value: 'enterprise_admin', label: '企业管理员' },
  { value: 'vip', label: 'VIP会员' },
  { value: 'premium', label: '普通会员' },
  { value: 'free', label: '免费用户' },
];
const LEVELS = [
  { value: '1', label: '1级（免费用户）' },
  { value: '2', label: '2级（普通会员）' },
  { value: '3', label: '3级（VIP会员）' },
  { value: '4', label: '4级（企业用户）' },
  { value: '5', label: '5级（超级管理员）' },
];

export default function PermissionOverrides() {
  // ── 筛选状态 ──
  const [targetType, setTargetType] = useState('user');
  const [targetId, setTargetId] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [searchUser, setSearchUser] = useState('');

  // ── 权限树 ──
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // ── 已有规则 ──
  const [rules, setRules] = useState<PermRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  // ── 提交 ──
  const [saving, setSaving] = useState(false);

  // 加载用户列表
  useEffect(() => {
    if (targetType === 'user') {
      const params = new URLSearchParams({ limit: '200' });
      if (searchUser) params.set('keyword', searchUser);
      fetch(`${USERS_API}?${params}`)
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            setUsers((d.data || []).map((u: any) => ({
              id: u.id,
              name: u.name || u.full_name || u.username || '',
              email: u.email || '',
            })));
          }
        })
        .catch(() => {});
    }
  }, [targetType, searchUser]);

  // 加载完整权限树（模块→页面→字段→按钮）
  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await fetch('/api/admin/permission-tree');
      const data = await res.json();
      if (data.success) {
        setTree(data.data || []);
      } else {
        toast.error('加载权限树失败');
      }
    } catch {
      toast.error('加载权限树失败');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  // 加载已有规则
  const loadRules = useCallback(async () => {
    if (!targetType || !targetId) { setRules([]); return; }
    setRulesLoading(true);
    try {
      const params = new URLSearchParams({ target_type: targetType, target_id: targetId, limit: '500' });
      const res = await fetch(`${API}?${params}`);
      const data = await res.json();
      if (data.success) setRules(data.data || []);
      else toast.error(data.error);
    } catch { toast.error('加载规则失败'); }
    finally { setRulesLoading(false); }
  }, [targetType, targetId]);

  useEffect(() => { loadRules(); }, [loadRules]);

  // 构建覆盖映射
  const overrideMap = new Map<string, PermRule>();
  rules.forEach(r => overrideMap.set(`${r.permission_type}:${r.permission_key}`, r));

  // 切换权限覆盖
  const toggleOverride = (type: string, key: string, field: 'visible' | 'editable') => {
    const ruleKey = `${type}:${key}`;
    const existing = overrideMap.get(ruleKey);

    if (existing) {
      const colName = field === 'visible' ? 'is_visible' : 'is_editable';
      const newVal = existing[colName] === false ? true : null; // null = 不限制（删除覆盖）
      // 如果都恢复为不限制，删除规则
      const otherCol = field === 'visible' ? 'is_editable' : 'is_visible';
      if (newVal === null && existing[otherCol] !== false) {
        setRules(prev => prev.filter(r => r.id !== existing.id));
      } else {
        setRules(prev => prev.map(r =>
          r.id === existing.id
            ? { ...r, [colName]: newVal }
            : r
        ));
      }
    } else {
      // 新建规则（点击即禁止：visible→false 或 editable→false）
      setRules(prev => [...prev, {
        id: `new_${type}_${key}`,
        target_type: targetType,
        target_id: targetId,
        permission_type: type,
        permission_key: key,
        is_visible: field === 'visible' ? false : null,
        is_editable: field === 'editable' ? false : null,
        priority: TARGET_TYPES.find(t => t.value === targetType)?.priority ?? 10,
        created_at: new Date().toISOString(),
      }]);
    }
  };

  // 检查覆盖状态（null = 未覆盖，false = 禁用，true = 允许）
  const getOverrideStatus = (type: string, key: string, field: 'visible' | 'editable') => {
    const rule = overrideMap.get(`${type}:${key}`);
    if (!rule) return null;
    const colName = field === 'visible' ? 'is_visible' : 'is_editable';
    return rule[colName];
  };

  // 获取节点的有效状态（考虑覆盖）
  const getNodeStatus = (node: TreeNode, field: 'visible' | 'editable') => {
    const override = getOverrideStatus(node.type, node.key, field);
    if (override !== null) return override;
    if (field === 'editable') return node.defaultEditable ?? true;
    return node.defaultVisible ?? true;
  };

  // 保存所有规则
  const handleSave = async () => {
    if (!targetType || !targetId) { toast.error('请先选择配置对象'); return; }
    setSaving(true);
    try {
      // 过滤掉新建的临时规则
      const toSave = rules.filter(r => !r.id.startsWith('new_'));
      // 新增的规则
      const toCreate = rules.filter(r => r.id.startsWith('new_'));

      // 删除已有规则中不在当前列表的（暂不处理，先只做创建和更新）
      // upsert 新建规则
      if (toCreate.length > 0) {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toCreate),
        });
        const data = await res.json();
        if (!data.success) { toast.error(data.error); return; }
      }

      // 更新已有规则
      for (const rule of toSave) {
        await fetch(`${API}/${rule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_visible: rule.is_visible, is_editable: rule.is_editable }),
        });
      }

      toast.success(`已保存 ${rules.length} 条权限规则`);
      loadRules(); // 刷新获取服务端生成的 ID
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  // 删除规则
  const handleDeleteRule = async (rule: PermRule) => {
    if (rule.id.startsWith('new_')) {
      setRules(prev => prev.filter(r => r.id !== rule.id));
      return;
    }
    try {
      const res = await fetch(`${API}/${rule.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { setRules(prev => prev.filter(r => r.id !== rule.id)); }
      else toast.error(data.error);
    } catch { toast.error('删除失败'); }
  };

  // 渲染目标选择器
  const renderTargetSelector = () => {
    return (
      <div className="flex flex-col gap-4">
        {/* 维度选择 */}
        <div className="flex items-center gap-3">
          {TARGET_TYPES.map(t => {
            const Icon = t.icon;
            return (
              <Button
                key={t.value}
                variant={targetType === t.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setTargetType(t.value); setTargetId(''); }}
              >
                <Icon className="h-4 w-4 mr-1" />
                {t.label}
              </Button>
            );
          })}
        </div>

        {/* 对象选择 */}
        {targetType === 'user' && (
          <div className="flex items-center gap-2">
            <input
              className="h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              placeholder="搜索用户名或邮箱..."
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
            />
            <select
              className="h-9 w-72 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">请选择用户</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </div>
        )}

        {targetType === 'role' && (
          <select
            className="h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">请选择角色</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        )}

        {targetType === 'level' && (
          <select
            className="h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">请选择等级</option>
            {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        )}
      </div>
    );
  };

  // 渲染权限树节点
  const renderNode = (node: TreeNode, depth: number = 0) => {
    const visibleStatus = getOverrideStatus(node.type, node.key, 'visible');
    const isBlocked = visibleStatus === false;
    const isEditableBlocked = getOverrideStatus(node.type, node.key, 'editable') === false;
    const hasOverride = visibleStatus !== null || isEditableBlocked !== null;
    const isField = node.type === 'field' || node.type === 'user_menu_field';
    const isUserMenu = node.type.startsWith('user_menu');

    return (
      <div key={node.key}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 ${node.children?.length ? '' : 'opacity-0'}`} />

          {/* 可见性开关 */}
          <button
            className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
              visibleStatus === null
                ? 'border-muted-foreground/30 bg-transparent'
                : visibleStatus
                  ? 'border-green-500 bg-green-500'
                  : 'border-red-400 bg-red-400'
            }`}
            onClick={() => targetId && toggleOverride(node.type, node.key, 'visible')}
            title={visibleStatus === null ? '点击禁用可见性' : visibleStatus ? '可见（点击切换）' : '不可见（点击恢复）'}
            disabled={!targetId}
          >
            {visibleStatus !== null && (
              <span className="text-white text-xs">{visibleStatus ? '✓' : '✕'}</span>
            )}
          </button>

          {/* 可编辑开关（仅字段类型） */}
          {isField && (
            <button
              className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                isEditableBlocked === null
                  ? 'border-muted-foreground/30 bg-transparent'
                  : isEditableBlocked
                    ? 'border-orange-400 bg-orange-400'
                    : 'border-blue-500 bg-blue-500'
              }`}
              onClick={() => targetId && toggleOverride(node.type, node.key, 'editable')}
              title={isEditableBlocked === null ? '点击设为只读' : isEditableBlocked ? '只读（点击恢复）' : '可编辑（点击设为只读）'}
              disabled={!targetId}
            >
              {isEditableBlocked !== null && (
                <span className="text-white text-xs font-bold">{isEditableBlocked ? 'R' : 'E'}</span>
              )}
            </button>
          )}

          {/* 标签 */}
          <span className={`text-sm flex-1 truncate ${isBlocked ? 'text-muted-foreground line-through' : ''}`}>
            {node.label}
          </span>
          <code className="text-xs text-muted-foreground">{node.key}</code>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${isField ? 'border-blue-300 text-blue-600' : ''} ${isUserMenu ? 'border-purple-300 text-purple-600' : ''}`}>
            {{ module: '模块', page: '页面', field: '字段', action: '按钮', user_menu: '菜单分组', user_menu_page: '菜单项', user_menu_field: '字段', user_menu_action: '按钮' }[node.type] || node.type}
          </Badge>

          {/* 字段可编辑状态 */}
          {isField && isEditableBlocked !== null && (
            <span className={`text-[10px] shrink-0 ${isEditableBlocked ? 'text-orange-500' : 'text-blue-500'}`}>
              {isEditableBlocked ? '只读' : '可编辑'}
            </span>
          )}

          {/* 已有覆盖时显示删除按钮 */}
          {hasOverride && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleDeleteRule(overrideMap.get(`${node.type}:${node.key}`)!)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* 子节点 */}
        {node.children?.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 说明 */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          权限优先级：用户个性化覆盖 (5) &gt; 角色权限 (10) &gt; 等级默认权限 (20) &gt; 系统默认配置。
          <strong>绿色圆点</strong> = 可见，<strong>红色圆点</strong> = 禁用，<strong>蓝色 E</strong> = 可编辑，<strong>橙色 R</strong> = 只读。
          点击可切换状态。无覆盖的项目使用系统默认配置。
        </AlertDescription>
      </Alert>

      {/* 选择配置维度和对象 */}
      {renderTargetSelector()}

      {/* 操作栏 */}
      {targetId && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            已配置 {rules.length} 条覆盖规则
            {rules.filter(r => r.id.startsWith('new_')).length > 0 && (
              <span className="ml-2 text-yellow-600">（含 {rules.filter(r => r.id.startsWith('new_')).length} 条未保存）</span>
            )}
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || rules.length === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <Save className="h-4 w-4 mr-1" />
            保存规则
          </Button>
        </div>
      )}

      {/* 权限树 */}
      {!targetId ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          请先选择配置对象以查看和编辑权限
        </div>
      ) : treeLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border rounded-lg p-2 space-y-0.5 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {tree.map(node => renderNode(node))}
        </div>
      )}
    </div>
  );
}
