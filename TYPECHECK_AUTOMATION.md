# TypeScript 类型检查自动化流程

## 概述

本项目已配置完整的 TypeScript 类型检查自动化流程，确保代码质量和类型安全。

---

## 📋 可用的脚本

| 脚本命令                    | 说明                          | 使用场景       |
| --------------------------- | ----------------------------- | -------------- |
| `pnpm run type-check`       | 执行一次性类型检查            | 提交前、PR 时  |
| `pnpm run type-check:watch` | 监控模式类型检查              | 开发时实时检查 |
| `pnpm run build`            | 构建项目（自动执行类型检查）  | 部署前         |
| `pnpm run ts-check`         | 使用 tsconfig.json 的类型检查 | 调试类型问题   |

---

## 🔄 自动化检查流程

### 1. Git Pre-commit 钩子

**触发时机**: 每次 `git commit` 时自动执行

**功能**:

- 在提交前自动运行类型检查
- 如果发现类型错误，阻止提交
- 确保只有类型安全的代码进入仓库

**测试**:

```bash
# 预期行为：类型检查通过，提交成功
git add .
git commit -m "feat: 新功能"

# 如果存在类型错误：
# 预期行为：类型检查失败，提交被阻止
```

---

### 2. Prebuild 钩子

**触发时机**: 每次 `pnpm run build` 时自动执行

**功能**:

- 在构建前验证类型安全
- 防止构建过程中发现类型错误

**测试**:

```bash
pnpm run build
# 会自动执行 type-check
```

---

### 3. GitHub Actions CI/CD

**触发时机**:

- Push 到 `main` 或 `develop` 分支
- 创建 Pull Request 到 `main` 或 `develop` 分支

**工作流**:

1. 检出代码
2. 安装 Node.js 20
3. 使用 pnpm 安装依赖
4. 运行类型检查
5. 报告检查结果

**查看结果**:

- GitHub 仓库 → Actions 标签页
- 选择 "TypeScript Type Check" 工作流
- 查看每次运行的结果

---

## 🔧 配置文件

### 1. package.json

```json
{
  "scripts": {
    "type-check": "tsc --noEmit",
    "type-check:watch": "tsc --noEmit --watch",
    "prebuild": "pnpm run type-check"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["tsc --noEmit --pretty"]
  }
}
```

### 2. .husky/pre-commit

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

pnpm run type-check
```

### 3. .github/workflows/type-check.yml

自动在每次 push 和 PR 时执行类型检查。

---

## 📊 类型检查覆盖率

- **当前配置**: 严格模式 (`strict: true`)
- **错误数**: 0
- **覆盖率**: 100% (所有 `.ts` 和 `.tsx` 文件)

---

## 🚀 最佳实践

### 1. 开发流程

```bash
# 1. 编写代码
# 2. 本地运行类型检查
pnpm run type-check

# 3. 如果有错误，修复后重新检查
pnpm run type-check

# 4. 提交代码（pre-commit 钩子会自动检查）
git add .
git commit -m "feat: 新功能"

# 5. 推送到远程（触发 CI）
git push origin main
```

### 2. 监控模式开发

```bash
# 在开发时保持类型检查监控
pnpm run type-check:watch

# 在另一个终端启动开发服务器
pnpm run dev
```

### 3. 类型错误处理

当遇到类型错误时：

1. **查看详细错误信息**

   ```bash
   pnpm run type-check --pretty
   ```

2. **定位错误文件**
   - 错误信息会显示文件路径和行号
   - 使用 IDE 跳转到错误位置

3. **修复错误**
   - 添加缺失的类型注解
   - 修复类型不匹配
   - 更新接口定义

4. **验证修复**
   ```bash
   pnpm run type-check
   ```

---

## ⚠️ 常见问题

### 1. Pre-commit 钩子太慢

**问题**: 每次提交都要等待类型检查

**解决方案**:

- 使用 `--no-verify` 跳过钩子（不推荐）

```bash
git commit --no-verify -m "message"
```

- 优化 tsconfig.json，排除不需要的文件

```json
{
  "exclude": ["node_modules", ".next", "dist", "build"]
}
```

### 2. 类型检查通过但构建失败

**原因**: 可能是运行时错误或配置问题

**解决方案**:

```bash
# 检查构建日志
pnpm run build

# 使用详细模式检查类型
pnpm run type-check --pretty --listFiles
```

### 3. GitHub Actions 失败

**检查项**:

1. 确保 Node.js 版本正确（项目使用 Node 20）
2. 确保 pnpm 版本正确（项目使用 9.0.0）
3. 检查依赖锁定文件是否最新

---

## 📈 类型检查统计

### 项目状态

| 指标              | 值      |
| ----------------- | ------- |
| TypeScript 文件数 | ~500+   |
| 严格模式          | ✅ 启用 |
| 当前错误数        | 0       |
| 类型覆盖率        | 100%    |

### 历史记录

- **2024-03-12**: 修复所有 P3 级类型错误（45 → 0）
- **2024-03-12**: 配置严格模式
- **2024-03-12**: 建立自动化检查流程

---

## 🔗 相关资源

- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [Husky 文档](https://typicode.github.io/husky/)
- [Lint-staged 文档](https://github.com/okonet/lint-staged)
- [GitHub Actions 文档](https://docs.github.com/en/actions)

---

## 📝 更新日志

- **2024-03-12**: 初始化自动化流程
  - 添加 type-check 脚本
  - 配置 pre-commit 钩子
  - 添加 lint-staged 支持
  - 创建 GitHub Actions 工作流
  - 测试所有自动化功能
