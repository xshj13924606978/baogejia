# SQL 执行与 Schema 缓存刷新指南

---

> ⛔ **DEPRECATED / CLOSED — 任意 SQL 执行包装器已关闭（fail-closed）**
>
> `src/lib/supabase-exec.ts` 曾是任意 SQL / DDL 的 RPC 包装器，现已 **fail-closed**：调用即抛错，
> 不读取环境变量、不建立数据库连接、不发起任何 RPC。
> 本文档中全部用法示例均为 **NON-EXECUTABLE HISTORICAL REFERENCE**，禁止照抄或复用。
> 数据库结构变更的唯一受支持入口是 **Migration Runner**，见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)。
> 正常业务数据访问（SELECT/INSERT/UPDATE/DELETE）应通过既有 data-access 层，而不是任意 SQL 包装器。

---

## 概述（已关闭 / CLOSED）

> ⛔ 本文档描述的 exec_sql 任意 SQL / DDL 包装器已关闭（fail-closed）。
> 历史上该包装器可执行任意 SQL，并在检测到 DDL 时执行 NOTIFY pgrst, 'reload schema'; 刷新
> PostgREST schema 缓存。该能力不再可用：结构变更只能通过 Migration Runner 执行，见
> docs/MIGRATION_RUNNER.md。

## 使用方法（已关闭 / CLOSED）

> ⛔ exec_sql 任意 SQL 包装器已 fail-closed：src/lib/supabase-exec.ts 中的调用即抛错，
> 不读取环境变量、不建立数据库连接、不发起任何 RPC。本文档所有用法示例均禁止复用。

- 结构 / 迁移变更：只能通过 **Migration Runner**（见 docs/MIGRATION_RUNNER.md）。
- 正常业务数据访问：通过既有 data-access 层（Supabase 客户端 / 仓储层），不使用任意 SQL 包装器。
- 数据库侧 exec_sql 的 EXECUTE 权限收敛（撤销 PUBLIC / anon / authenticated）属于后续独立的
  受审 DB-security migration 阶段，不在本应用侧 closure 范围内
  （DB_EXEC_SQL_PRIVILEGE_REVOCATION_REQUIRED=YES）。
