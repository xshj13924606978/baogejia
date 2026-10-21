# ESLint 警告优化机制

本目录包含用于跟踪和优化项目 ESLint 警告的工具和配置。

## 📊 当前状态

- **警告总数**: 590
- **错误总数**: 0
- **有警告的文件数**: 144
- **主要类型**: `@typescript-eslint/no-unused-vars`

## 🛠️ 可用脚本

### 1. 警告跟踪脚本

生成详细的 ESLint 警告报告：

```bash
pnpm run lint:track
```

输出：
- 总警告数和错误数
- 每个文件的警告数统计
- 前 20 个最严重的文件
- 保存报告到 `eslint-warnings-report.json`

### 2. 阈值检查脚本

检查警告数量是否超过阈值：

```bash
pnpm run lint:threshold
```

配置：
- 警告阈值: 600
- 错误阈值: 10

### 3. PR 检查

完整的 PR 提交前检查：

```bash
pnpm run pr-check
```

包括：
- TypeScript 类型检查
- ESLint 阈值检查

## 📁 文件说明

### 脚本文件

- `track-eslint-warnings.js` - 警告跟踪脚本
- `check-warning-threshold.js` - 阈值检查脚本

### 配置文件

- `.github/workflows/weekly-cleanup.yml` - 每周自动运行警告跟踪
- `docs/warning-priorities.md` - 警告处理优先级指南
- `.vscode/extensions.json` - VS Code 扩展推荐

## 🎯 使用建议

### 日常开发

1. **提交代码前**：
   ```bash
   pnpm run pr-check
   ```

2. **定期清理**：
   ```bash
   pnpm run lint:track  # 查看当前状态
   pnpm run lint:fix   # 自动修复
   ```

### 查看报告

```bash
# 生成并查看报告
pnpm run lint:track
cat eslint-warnings-report.json

# 查看 JSON 格式（使用 jq）
cat eslint-warnings-report.json | jq '.summary'
```

### 处理高优先级警告

根据报告中的 `topFiles`，优先处理警告数最多的文件：

```bash
# 例如处理 src/components/quote-table.tsx
pnpm lint src/components/quote-table.tsx
```

## 📈 跟踪进度

### 每周自动报告

GitHub Actions 会在每周一早上 9 点（北京时间）自动运行警告跟踪，生成报告并保存为 artifact。

### 手动触发

在 GitHub Actions 页面手动触发 "Weekly ESLint Warning Cleanup" workflow。

## 🔧 自定义配置

### 修改阈值

编辑 `scripts/check-warning-threshold.js`：

```javascript
const WARNING_THRESHOLD = 600; // 修改此值
const ERROR_THRESHOLD = 10;    // 修改此值
```

### 修改报告格式

编辑 `scripts/track-eslint-warnings.js` 中的输出格式。

## 📚 相关文档

- [ESLint 配置](../eslint.config.mjs)
- [警告处理优先级指南](../docs/warning-priorities.md)
- [TypeScript 配置](../tsconfig.json)

## 💡 最佳实践

1. **预防胜于治疗**：编码时注意避免未使用的变量
2. **定期清理**：每周查看一次警告报告
3. **渐进式改进**：优先处理高优先级文件
4. **团队协作**：在代码审查中关注新引入的警告

## 🚀 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 查看当前警告状态
pnpm run lint:track

# 3. 自动修复（如果可能）
pnpm run lint:fix

# 4. 检查是否通过阈值
pnpm run lint:threshold

# 5. 提交前完整检查
pnpm run pr-check
```
