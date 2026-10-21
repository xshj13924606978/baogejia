# 🚀 Legacy SQL Fix Guide — Historical Reference Only（历史参考，非操作手册）

---

> ⚠️ **本文档是 Historical failure mode 记录，不是 current fix procedure。**
>
> 本文件描述的"复制 SQL 到 SQL Editor 执行"做法已 **整体关闭**。

## 当前规则（Current rules）

1. **不复制 SQL 到 SQL Editor**，不在 Supabase Dashboard / psql / Management API 手工执行任何 SQL 或 DDL。
2. **不通过任意 SQL RPC（`exec_sql`）修 schema**；应用侧包装器已 fail-closed。
3. **不手工运行 migration DDL**（CREATE / ALTER / DROP / CREATE VIEW 等）。
4. 结构变更必须经过 **audited migration**，并由 **Migration Runner** 执行：

```bash
node scripts/migration-runner.mjs status
node scripts/migration-runner.mjs up
node scripts/migration-runner.mjs verify
```

见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)。

---

## Historical failure mode（历史误操作，仅作背景）

历史上，有人把**文档正文**（含编号列表）当作 SQL 粘贴进 SQL 编辑器执行，于是 SQL 解析器报出：

```
ERROR: 42601: syntax error at or near "1."
LINE 1: 1. 登录 Supabase Dashboard
```

**问题**：执行的是文档说明文字，而不是 SQL 命令。

### 历史错误示例（NON-EXECUTABLE HISTORICAL REFERENCE — DO NOT RUN MANUALLY）

```sql
-- 这是历史错误示例：把说明文字当成命令执行
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 复制并执行...
```

### 历史"正确"做法（同样已关闭，仅作追溯）

历史上曾用过"打开 `QUICK_FIX.sql` / `PURE_SQL_FIX.sql` → 复制全部内容 → SQL Editor → Run"的流程。
该流程属于 **migration bypass**，现在 **不再受支持**；仅作为历史背景保留在此。

### 历史验证方式（已关闭）

历史上执行过只读查询来肉眼确认结果，例如（**仅供追溯，禁止作为 runbook**）：

```sql
-- NON-EXECUTABLE HISTORICAL REFERENCE
-- SELECT * FROM product_field_configs ORDER BY display_order;
```

当前版本这类确认由 **受审 migration + deployment verification** 完成：

```bash
node scripts/migration-runner.mjs verify
```

## 结论

- 本文档不再提供任何"复制 SQL / 执行 SQL / 点击 Run"的现行步骤。
- 任何数据库结构问题都应通过 **audited migration + Migration Runner** 解决。
- 应用侧不会生成、返回或展示可执行 DDL；管理员也不需要手工执行 SQL。
