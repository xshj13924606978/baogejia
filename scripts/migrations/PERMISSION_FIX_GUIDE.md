# 积分系统权限修复指南

## 已完成的修复

### 1. 权限配置 ✅
以下权限已成功添加到数据库：

| 权限代码 | 名称 | super_admin | admin |
|---------|------|-------------|-------|
| admin.billing.view | 查看计费配置 | ✅ | ✅ |
| admin.billing.edit | 编辑计费配置 | ✅ | ✅ |
| admin.points.view | 查看积分流水 | ✅ | ✅ |
| admin.points.manage | 管理积分 | ✅ | - |

---

## 待手动执行的 SQL

### 2. 创建 point_logs 表 ⚠️

由于 Supabase REST API 不支持 DDL 操作，您需要在 **Supabase 控制台** 中手动执行以下 SQL：

**步骤：**
1. 打开 [Supabase 控制台](https://supabase.com/dashboard)
2. 选择项目：`tjbnjrcgmyiwudqptfhc`
3. 点击左侧菜单 **SQL Editor**
4. 创建新查询，粘贴以下 SQL：

```sql
-- ============================================================================
-- 创建 point_logs 表（积分流水记录）
-- ============================================================================

CREATE TABLE IF NOT EXISTS point_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    points INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    balance_after INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_point_logs_user_id ON point_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_created_at ON point_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_point_logs_type ON point_logs(type);

-- 添加外键约束（如果 users 表存在）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_point_logs_user_id'
        ) THEN
            ALTER TABLE point_logs
            ADD CONSTRAINT fk_point_logs_user_id
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 添加注释
COMMENT ON TABLE point_logs IS '积分变动流水记录';
COMMENT ON COLUMN point_logs.user_id IS '用户ID';
COMMENT ON COLUMN point_logs.points IS '积分变动数量（正数为获得，负数为消费）';
COMMENT ON COLUMN point_logs.type IS '变动类型：register, login, upload, reward, consume, exchange 等';
COMMENT ON COLUMN point_logs.description IS '变动说明';
COMMENT ON COLUMN point_logs.balance_after IS '变动后的积分余额';
```

5. 点击 **Run** 执行 SQL

---

## 验证修复结果

执行完上述 SQL 后，刷新以下页面验证：

1. **积分规则配置** - `/admin/points` 的 "积分规则配置" 标签
2. **积分流水** - `/admin/points` 的 "积分流水" 标签

---

## 如果问题仍然存在

请检查：

1. **用户角色** - 确保登录用户在 `user_roles` 表中有 `super_admin` 或 `admin` 角色
2. **浏览器缓存** - 清除浏览器缓存后重试
3. **开发服务器** - 重启 Next.js 开发服务器

检查当前用户角色的 SQL：
```sql
SELECT u.id, u.email, ur.role
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email = 'your-email@example.com';
```
