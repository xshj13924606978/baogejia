# 判重配置 500 错误修复说明

---

> ⚠️ **Legacy / historical procedure — Do not execute manually（历史文档，禁止手工执行）**
>
> 本文档只记录历史背景与历史修复过程。**当前不得手工执行其中的任何 SQL / DDL**：
> 不得使用 Supabase SQL Editor、`exec_sql` RPC、psql、Management API，也不得复制/下载脚本后人工执行。
> 数据库结构变更的唯一受支持入口是 **Migration Runner**，见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)。
> 文中保留的 SQL 片段一律视为 **NON-EXECUTABLE HISTORICAL REFERENCE**，不是操作手册（runbook）。

---

## 问题诊断

从错误日志中发现的问题：

1. **判重配置API返回500错误**：
   ```
   GET /api/tables/products/duplicate-check-config 500 (Internal Server Error)
   ```

2. **导入日志API返回500错误**：
   ```
   GET /api/admin/import-logs 500 (Internal Server Error)
   ```

3. **数据库表或列缺失**：
   - `product_field_configs` 表存在，但缺少 `is_duplicate_check` 列
   - `import_logs` 表可能不存在

## 修复内容

### 1. 修复判重配置API错误处理

**文件**: `src/app/api/tables/products/duplicate-check-config/route.ts`

**修改内容**:
- 将所有错误响应的HTTP状态码从500改为200
- 添加 `needInit` 标志，指示前端是否需要初始化
- 添加表存在性检查，避免直接查询不存在的表
- 添加 `hasDuplicateCheckColumn` 标志，指示列是否存在

**修复前**:
```typescript
return NextResponse.json(
  { success: false, error: allFieldsError.message },
  { status: 500 }  // ❌ 返回500
);
```

**修复后**:
```typescript
return NextResponse.json({
  success: false,
  error: allFieldsError.message,
  needInit: true,  // ✅ 添加初始化标志
  data: { allFields: [], duplicateCheckFields: [] }
}, { status: 200 });  // ✅ 返回200
```

### 2. 修复导入日志API错误处理

**文件**: `src/app/api/admin/import-logs/route.ts`

**修改内容**:
- 添加表存在性检查
- 将错误响应状态码从500改为200
- 返回完整的分页信息，确保前端能够正常渲染

**修复前**:
```typescript
return NextResponse.json(
  { success: false, error: error.message },
  { status: 500 }  // ❌ 返回500
);
```

**修复后**:
```typescript
return NextResponse.json({
  success: false,
  error: error.message,
  data: [],
  pagination: {
    total: 0,
    limit,
    offset,
    hasMore: false,
  },
}, { status: 200 });  // ✅ 返回200并包含完整数据结构
```

### 3-4. Historical implementation — no longer supported（历史实现，已不再支持）

> ⛔ 以下两项历史实现均已移除，**不再受支持**：
>
> * 数据库初始化 API 曾返回完整初始化 SQL（`sqlStatements` / `requiresManualSetup`）—— 该行为已关闭。
> * 判重配置组件曾自动获取初始化 SQL 并展示 / 提供下载 —— 该 UI 已移除。
>
> 当前语义：API 与前端都 **不生成、不返回、不展示 SQL**；结构未就绪时应用 fail-closed
> （database schema requires an audited migration），由部署管理员通过受审 Migration Runner 迁移修复。

## 测试结果

### API测试

1. **判重配置API**:
   ```bash
   curl http://localhost:5000/api/tables/products/duplicate-check-config
   ```
   ✅ 返回200，正确识别缺少 `is_duplicate_check` 列

2. **导入日志API**:
   ```bash
   curl "http://localhost:5000/api/admin/import-logs?limit=20&status=all"
   ```
   ✅ 返回200，正确识别表不存在

3. **初始化API（Historical — no longer supported）**:
   ```bash
   curl -X POST http://localhost:5000/api/admin/init-duplicate-check
   ```
   ⛔ 历史行为：曾返回200并提供完整的初始化SQL；该行为已关闭，该端点不再作为受支持入口。

### 类型检查
```bash
npx tsc --noEmit
```
✅ 通过，无类型错误

### 服务状态
```bash
curl -I http://localhost:5000
```
✅ HTTP/1.1 200 OK，服务正常运行

## 用户操作指南（当前行为）

### 当前：500 / schema prerequisite 的处理路径

1. 应用侧 fail-closed：相关 API 返回脱敏错误与 `requiresAuditedMigration`，
   页面显示"数据库结构尚未通过受审迁移准备完成（database schema requires an audited migration）"。
2. 管理员 / 部署人员通过 **audited migration + Migration Runner** 修复，而不是复制或执行 SQL：

```bash
node scripts/migration-runner.mjs status
node scripts/migration-runner.mjs up
node scripts/migration-runner.mjs verify
```

3. 迁移完成后刷新页面即可正常使用；页面不提供复制 SQL / 下载 SQL / SQL Editor 指引。

### Historical implementation — no longer supported

> 历史上页面曾在"数据库初始化"提示中展示 SQL，并提供"复制 SQL 语句" / "下载 SQL 文件"。
> 该流程属于 migration bypass，已移除。

## 技术细节

### 为什么从500改为200？

1. **用户体验**: 500错误会让用户以为系统崩溃，而200可以给用户明确的指引
2. **前端处理**: 前端可以检查 `needInit` 标志来决定显示初始化UI还是正常配置UI
3. **容错能力**: 即使数据库状态不完整，前端也能优雅地降级显示

### 初始化检测流程

```
1. GET /api/tables/products/duplicate-check-config
   ↓
2. 检查表是否存在
   ├─ 不存在 → 返回 needInit=true
   └─ 存在 → 继续
       ↓
   3. 检查 is_duplicate_check 列是否存在
   ├─ 不存在 → 返回 needInit=true
   └─ 存在 → 返回正常数据
```

### 初始化SQL内容（Historical — no longer supported）

> ⛔ 历史上"完整初始化 SQL"包含建表 / 插入默认配置 / 建索引 / 注释等。
> 该 SQL 生成与下发流程已关闭，当前不再由应用生成或返回任何初始化 SQL。

## 相关文件

### 修改的文件
- `src/app/api/tables/products/duplicate-check-config/route.ts`
- `src/app/api/admin/import-logs/route.ts`
- `src/app/api/admin/init-duplicate-check/route.ts`
- `src/components/admin/duplicate-check-config.tsx`

### 新增的文件
- `docs/FIX_500_ERROR.md` - 本文档

### 现有的文档
- `docs/QUICK_START.md` - 快速开始指南
- `docs/DATABASE_INIT.md` - 数据库初始化指南
- `database/migrations/COMPLETE_INIT.sql` - 完整初始化脚本

## 常见问题

### Q1: 修复后仍然看到500错误？

**A**: 请清除浏览器缓存并刷新页面。如果问题仍然存在，检查：
1. 服务是否正常重启
2. 浏览器控制台是否还有500错误
3. 服务端日志是否有新的错误

### Q2（历史问题）：为什么页面仍显示结构未就绪？

**A**: 当前不存在"执行 SQL 后刷新"的修复路径。结构未就绪说明受审迁移尚未就绪：
1. 用 `node scripts/migration-runner.mjs status` / `verify` 确认受审迁移状态
2. 由部署管理员通过 Migration Runner 完成受审迁移
3. 迁移通过后刷新页面；页面不会要求人工执行任何 SQL

### Q3: 可以直接在代码中执行SQL吗？

**A**: 禁止。无论通过应用代码（`exec_sql` 任意 SQL 包装器已 fail-closed）还是 SQL Editor 手工执行，都不得执行 DDL；DDL 只能由受审 Migration Runner 执行（见 `docs/MIGRATION_RUNNER.md`）。

### Q4: 如何确认初始化成功？

**A**: 
1. 刷新判重配置页面
2. 应该看到字段列表而不是初始化提示
3. 可以勾选字段并保存
4. 保存后提示成功

## 总结（当前语义）

本次历史修复的背景结论（按当前语义重述）：

1. ✅ API 错误处理不再把 schema prerequisite 暴露为可执行 SQL 指引
2. ✅ 检测逻辑保留为 fail-closed 状态标记（`requiresAuditedMigration`）
3. ⛔ "提供完整初始化 SQL 与操作指引"已不再是受支持行为
4. ✅ 前端组件在结构未就绪时显示 fail-closed 状态，而非 SQL
5. 当前修复路径：通过 **audited migration** 提交迁移，并由 **Migration Runner** 执行与校验
