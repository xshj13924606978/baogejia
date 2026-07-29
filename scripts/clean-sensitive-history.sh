#!/bin/bash
# ============================================================================
# 清除 Git 历史中的敏感数据
# 
# 使用方法：
#   chmod +x scripts/clean-sensitive-history.sh
#   ./scripts/clean-sensitive-history.sh
#
# 前置条件：
#   - 安装 BFG Repo-Cleaner: https://rtyley.github.io/bfg-repo-cleaner/
#     macOS: brew install bfg
#     Linux: 下载 jar 包 https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar
#   - 或安装 git-filter-repo: pip install git-filter-repo
#
# ⚠️ 警告：此脚本会重写 Git 历史，执行前请确保：
#   1. 已备份仓库
#   2. 所有协作者已知晓（需要 force push）
#   3. 在执行后轮换所有泄露的密钥
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

cd "$REPO_ROOT" || error "无法进入项目目录"

# 初始化 glob 处理用的数组
GLOB_EXPANDED_RESULTS=()
GLOB_UNMATCHED=()
EXACT_CUSTOM_FILES=()

# ----- 第 0 步：安全检查 -----
echo ""
echo "=========================================="
echo "  Git 敏感历史清除工具"
echo "=========================================="
echo ""

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    error "存在未提交的更改，请先提交或暂存后再执行此脚本"
fi

# 检查当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "无")
CURRENT_COMMIT=$(git rev-parse --short HEAD)

# ===== 自定义敏感文件配置 =====
# 如需清除额外的文件，编辑此数组（每行一个路径）
# 支持精确路径匹配，也支持 glob 模式（由脚本自动扫描历史匹配）
#
# 示例：
#   CUSTOM_SENSITIVE_FILES=(
#       "src/lib/config-secrets.ts"
#       "nginx/ssl/private.key"
#       "scripts/deploy-prod.sh"
#   )
CUSTOM_SENSITIVE_FILES=()

# 自定义敏感内容替换规则（可选）
# 格式：源文件路径: 要查找的字符串: 替换为的字符串
# 用于文件无法直接删除但需清除其中敏感内容的情况
#
# 示例：
#   CUSTOM_REPLACE_RULES=(
#       ".env.example:YOUR_API_KEY:YOUR_API_KEY"
#       "config.ts:password = 'YOUR_DATABASE_PASSWORD':password = 'YOUR_PASSWORD'"
#   )
CUSTOM_REPLACE_RULES=()

# ===== 加载配置文件（可选） =====
CUSTOM_CONFIG="${REPO_ROOT}/.clean-sensitive-config"
if [ -f "$CUSTOM_CONFIG" ]; then
    info "检测到自定义配置文件: $CUSTOM_CONFIG"
    # 从配置文件读取自定义文件路径（忽略空行和注释）
    while IFS= read -r line; do
        # 跳过空行和 # 注释
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        # 跳过已定义的指令行（如 REPLACE:）
        [[ "$line" =~ ^[[:space:]]*(REPLACE:|SKIP:) ]] && continue
        CUSTOM_SENSITIVE_FILES+=("$line")
    done < "$CUSTOM_CONFIG"
    info "  已加载 ${#CUSTOM_SENSITIVE_FILES[@]} 个自定义文件路径"

    # 从配置文件读取替换规则
    while IFS= read -r line; do
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" =~ ^REPLACE:[[:space:]]*(.+) ]] && CUSTOM_REPLACE_RULES+=("${BASH_REMATCH[1]}")
    done < "$CUSTOM_CONFIG"
    if [ ${#CUSTOM_REPLACE_RULES[@]} -gt 0 ]; then
        info "  已加载 ${#CUSTOM_REPLACE_RULES[@]} 条替换规则"
    fi
fi

warn "即将清除 Git 历史中的敏感数据"
echo ""
echo "  仓库目录:  $REPO_ROOT"
echo "  当前分支:  $CURRENT_BRANCH"
echo "  远程仓库:  $CURRENT_REMOTE"
echo "  当前提交:  $CURRENT_COMMIT"
if [ ${#CUSTOM_SENSITIVE_FILES[@]} -gt 0 ]; then
    echo "  自定义文件:  ${#CUSTOM_SENSITIVE_FILES[@]} 个"
fi
if [ ${#CUSTOM_REPLACE_RULES[@]} -gt 0 ]; then
    echo "  替换规则:  ${#CUSTOM_REPLACE_RULES[@]} 条"
fi
echo ""

echo -e "${YELLOW}确认继续？这将重写 Git 历史！(yes/no): ${NC}"
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    info "已取消"
    exit 0
fi

# ----- 第 1 步：创建完整备份 -----
BACKUP_DIR="${REPO_ROOT}/../.git-backup-$(date +%Y%m%d_%H%M%S)"
info "创建仓库备份到: $BACKUP_DIR"
git clone --mirror "$REPO_ROOT" "$BACKUP_DIR"
info "备份完成"

# ----- 第 2 步：定义需要清除的文件 -----
echo ""

# === 高优先级：含密钥/密码的敏感文件 ===
SENSITIVE_FILES=(
    ".env.production"
    ".env.production.bak.20260225_194303"
    "test-supabase.js"
    "test_pg.js"
    "test_pg2.js"
)

# === 中优先级：测试/调试路由（暴露内部实现） ===
TEST_ROUTE_FILES=(
    "src/app/api/test-service-key/route.ts"
    "src/app/api/test-supabase/route.ts"
    "src/app/api/test-db/route.ts"
    "src/app/api/test-full-upload/route.ts.backup"
    "src/app/api/test-real-upload/route.ts.backup"
    "src/app/api/admin/permission-test/all/route.ts.backup"
    "src/app/api/admin/permission-test/all/route.ts.bak"
    "src/app/api/admin/permission-test/all/route.ts.backup"
    "src/app/api/admin/test-permission/route.ts.backup"
    "src/app/api/admin/test-db/route.ts"
)

# === 低优先级：所有备份文件（.bak / .backup_* / .bak.*） ===
# 通过 glob 模式匹配，无需逐个列举

ALL_FILES_TO_REMOVE=(
    "${SENSITIVE_FILES[@]}"
    "${TEST_ROUTE_FILES[@]}"
)

# 动态收集历史中的备份文件
BACKUP_IN_HISTORY=$(git log --all --full-history --diff-filter=A --name-only --pretty=format: | sort -u | grep -E '\.(bak|backup)' || true)
for f in $BACKUP_IN_HISTORY; do
    ALL_FILES_TO_REMOVE+=("$f")
done

# ----- 处理自定义文件中的 glob 通配符 -----
# 支持 * ** ? 通配符
#   *   → 匹配不含 / 的任意字符（单层段内）
#   **  → 匹配零或多级目录
#   ?   → 匹配单个不含 / 的字符
# 通过 Python 批量匹配，避免逐个启动进程的开销
if ! command -v python3 &>/dev/null; then
    error "此脚本需要 python3 来支持 glob 通配符匹配，请先安装 python3"
fi

GLOB_HIST_FILES=$(git log --all --full-history --diff-filter=A --name-only --pretty=format: | sort -u || true)

if [ ${#CUSTOM_SENSITIVE_FILES[@]} -gt 0 ]; then
    # 将历史文件列表和自定义路径写入临时文件供 Python 读取
    _GLOB_TMPDIR=$(mktemp -d)

    printf '%s\n' "$GLOB_HIST_FILES" > "$_GLOB_TMPDIR/hist_files.txt"

    # 写入自定义路径（标记通配符/精确）
    _ENTRY_IDX=0
    > "$_GLOB_TMPDIR/entries.txt"
    for entry in "${CUSTOM_SENSITIVE_FILES[@]}"; do
        if [[ "$entry" == *"*"* ]] || [[ "$entry" == *"?"* ]]; then
            echo "GLOB	$_ENTRY_IDX	$entry" >> "$_GLOB_TMPDIR/entries.txt"
        else
            echo "EXACT	$_ENTRY_IDX	$entry" >> "$_GLOB_TMPDIR/entries.txt"
        fi
        _ENTRY_IDX=$((_ENTRY_IDX + 1))
    done

    # Python 批量匹配：输出匹配文件列表、展开结果、未匹配列表
    python3 "$SCRIPT_DIR/_glob_match.py" \
        "$_GLOB_TMPDIR/hist_files.txt" \
        "$_GLOB_TMPDIR/entries.txt" \
        "$_GLOB_TMPDIR/matched_files.txt" \
        "$_GLOB_TMPDIR/expanded_patterns.txt" \
        "$_GLOB_TMPDIR/unmatched_patterns.txt" \
        "$_GLOB_TMPDIR/exact_files.txt"

    # 读取 Python 输出
    while IFS= read -r f; do
        ALL_FILES_TO_REMOVE+=("$f")
    done < "$_GLOB_TMPDIR/matched_files.txt"

    while IFS= read -r p; do
        GLOB_EXPANDED_RESULTS+=("$p")
    done < "$_GLOB_TMPDIR/expanded_patterns.txt"

    while IFS= read -r p; do
        GLOB_UNMATCHED+=("$p")
    done < "$_GLOB_TMPDIR/unmatched_patterns.txt"

    while IFS= read -r f; do
        ALL_FILES_TO_REMOVE+=("$f")
        EXACT_CUSTOM_FILES+=("$f")
    done < "$_GLOB_TMPDIR/exact_files.txt"

    # 清理临时文件
    rm -rf "$_GLOB_TMPDIR"
fi

info "需要清除的文件列表:"
info ""
info "  [高危] 敏感文件（含密钥/密码）:"
for file in "${SENSITIVE_FILES[@]}"; do
    EXISTS=$(git log --all --full-history -- "$file" 2>/dev/null | head -1)
    if [ -n "$EXISTS" ]; then
        warn "    $file  ✓ 存在于历史中"
    else
        echo "      $file  ✗ 不在历史中"
    fi
done

info ""
info "  [中危] 测试/调试路由:"
for file in "${TEST_ROUTE_FILES[@]}"; do
    EXISTS=$(git log --all --full-history -- "$file" 2>/dev/null | head -1)
    if [ -n "$EXISTS" ]; then
        warn "    $file  ✓ 存在于历史中"
    else
        echo "      $file  ✗ 不在历史中"
    fi
done

BACKUP_COUNT=$(echo "$BACKUP_IN_HISTORY" | wc -l)
info ""
info "  [低危] 备份文件 (.bak/.backup): ${BACKUP_COUNT} 个"
if [ ${#CUSTOM_SENSITIVE_FILES[@]} -gt 0 ]; then
    info ""
    info "  [自定义] 用户指定的文件:"

    # 展示精确路径
    if [ ${#EXACT_CUSTOM_FILES[@]} -gt 0 ]; then
        echo ""
        echo "    精确路径:"
        for file in "${EXACT_CUSTOM_FILES[@]}"; do
            EXISTS=$(git log --all --full-history -- "$file" 2>/dev/null | head -1)
            if [ -n "$EXISTS" ]; then
                warn "      $file  ✓ 存在于历史中"
            else
                echo "        $file  ✗ 不在历史中"
            fi
        done
    fi

    # 展示 glob 展开结果
    if [ ${#GLOB_EXPANDED_RESULTS[@]} -gt 0 ]; then
        echo ""
        echo "    glob 模式（已展开为匹配的具体文件）:"
        for line in "${GLOB_EXPANDED_RESULTS[@]}"; do
            # 格式: "pattern	count"
            local g_pattern="${line%%	*}"
            local g_count="${line##*	}"
            warn "      $g_pattern  → 匹配 ${g_count} 个文件"
        done
    fi

    # 展示未匹配的 glob
    if [ ${#GLOB_UNMATCHED[@]} -gt 0 ]; then
        echo ""
        echo "    glob 模式（未匹配到任何历史文件）:"
        for glob_pattern in "${GLOB_UNMATCHED[@]}"; do
            echo "        $glob_pattern  ✗ 无匹配"
        done
    fi
fi
if [ ${#CUSTOM_REPLACE_RULES[@]} -gt 0 ]; then
    info ""
    info "  [替换] 内容替换规则:"
    for rule in "${CUSTOM_REPLACE_RULES[@]}"; do
        echo "    $rule"
    done
fi
info ""
info "  合计: ${#ALL_FILES_TO_REMOVE[@]} 个文件将被清除"

# ----- 第 3 步：选择清除工具 -----
detect_tool() {
    if command -v git-filter-repo &>/dev/null; then
        echo "filter-repo"
    elif command -v java &>/dev/null && [ -f "$SCRIPT_DIR/bfg.jar" ]; then
        echo "bfg"
    elif command -v bfg &>/dev/null; then
        echo "bfg"
    else
        echo "none"
    fi
}

TOOL=$(detect_tool)

if [ "$TOOL" = "none" ]; then
    echo ""
    echo "未检测到清除工具，请选择安装方式："
    echo "  1) 使用 git-filter-repo (推荐，Python)"
    echo "  2) 使用 BFG Repo-Cleaner (Java)"
    echo "  3) 退出"
    echo ""
    read -p "选择 (1/2/3): " CHOICE
    case "$CHOICE" in
        1)
            pip install git-filter-repo 2>/dev/null || pip3 install git-filter-repo 2>/dev/null || error "安装 git-filter-repo 失败"
            TOOL="filter-repo"
            ;;
        2)
            BFG_URL="https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar"
            curl -L "$BFG_URL" -o "$SCRIPT_DIR/bfg.jar" || error "下载 BFG 失败"
            TOOL="bfg"
            ;;
        3)
            info "已退出"
            exit 0
            ;;
        *)
            error "无效选择"
            ;;
    esac
fi

# ----- 第 4 步：执行清除 -----
info "使用 $TOOL 清除敏感文件..."

case "$TOOL" in
    filter-repo)
        # git-filter-repo 方式：逐个文件构建 --invert-paths 参数
        FILTER_REPO_ARGS="--invert-paths --force"
        for file in "${ALL_FILES_TO_REMOVE[@]}"; do
            # 跳过空行
            [ -z "$file" ] && continue
            FILTER_REPO_ARGS="$FILTER_REPO_ARGS --path $file"
        done

        info "执行 git-filter-repo ..."
        eval git filter-repo $FILTER_REPO_ARGS 2>&1 || error "git-filter-repo 执行失败"
        ;;

    bfg)
        # BFG 方式
        BFG_CMD="bfg"
        if [ -f "$SCRIPT_DIR/bfg.jar" ]; then
            BFG_CMD="java -jar $SCRIPT_DIR/bfg.jar"
        fi

        # 创建临时 bare clone（BFG 需要）
        TEMP_CLONE="${REPO_ROOT}/../.temp-bare-repo"
        git clone --bare "$REPO_ROOT" "$TEMP_CLONE"

        # 执行 BFG（逐个删除文件）
        BFG_DELETE_ARGS=""
        for file in "${ALL_FILES_TO_REMOVE[@]}"; do
            [ -z "$file" ] && continue
            BFG_DELETE_ARGS="$BFG_DELETE_ARGS --delete-files $file"
        done

        info "执行 BFG Repo-Cleaner ..."
        eval $BFG_CMD $BFG_DELETE_ARGS "$TEMP_CLONE" 2>&1 || {
            rm -rf "$TEMP_CLONE"
            error "BFG 执行失败"
        }

        # 将清理后的历史推回原仓库
        cd "$TEMP_CLONE"
        git push --force "$REPO_ROOT" HEAD:refs/heads/$CURRENT_BRANCH 2>&1 || {
            rm -rf "$TEMP_CLONE"
            error "BFG 推送失败"
        }
        cd "$REPO_ROOT"
        rm -rf "$TEMP_CLONE"
        ;;
esac

# ----- 第 5 步：清理 Git 残留引用和垃圾回收 -----
info "清理 Git 引用和垃圾回收..."
git reflog expire --expire=now --all 2>/dev/null
git gc --prune=now --aggressive 2>/dev/null

# ----- 第 6 步：验证 -----
info "验证清除结果..."
echo ""

ALL_CLEAR=true

# 验证敏感文件
info "验证 [高危] 敏感文件:"
for file in "${SENSITIVE_FILES[@]}"; do
    REMAINING=$(git log --all --full-history -- "$file" 2>/dev/null | wc -l)
    if [ "$REMAINING" -gt 0 ]; then
        error "  仍有残留: $file (发现 $REMAINING 条历史记录)"
        ALL_CLEAR=false
    else
        info "  已清除: $file"
    fi
done

# 验证测试路由
info ""
info "验证 [中危] 测试路由:"
for file in "${TEST_ROUTE_FILES[@]}"; do
    REMAINING=$(git log --all --full-history -- "$file" 2>/dev/null | wc -l)
    if [ "$REMAINING" -gt 0 ]; then
        warn "  仍有残留: $file"
        ALL_CLEAR=false
    fi
done

# 验证备份文件是否还存在
BACKUP_REMAINING=$(git log --all --full-history --diff-filter=A --name-only --pretty=format: | sort -u | grep -E '\.(bak|backup)' | wc -l)
if [ "$BACKUP_REMAINING" -gt 0 ]; then
    warn "  仍有 ${BACKUP_REMAINING} 个备份文件残留在历史中"
    ALL_CLEAR=false
else
    info "  所有备份文件已清除"
fi

# 验证自定义文件
if [ ${#CUSTOM_SENSITIVE_FILES[@]} -gt 0 ]; then
    info ""
    info "验证 [自定义] 用户指定文件:"
    for file in "${CUSTOM_SENSITIVE_FILES[@]}"; do
        REMAINING=$(git log --all --full-history -- "$file" 2>/dev/null | wc -l)
        if [ "$REMAINING" -gt 0 ]; then
            warn "  仍有残留: $file"
            ALL_CLEAR=false
        else
            info "  已清除: $file"
        fi
    done
fi

# ----- 第 6.5 步：执行自定义内容替换（如果有） -----
if [ ${#CUSTOM_REPLACE_RULES[@]} -gt 0 ]; then
    info ""
    info "执行自定义内容替换..."

    if ! command -v git-filter-repo &>/dev/null; then
        warn "  跳过: 内容替换需要 git-filter-repo"
        warn "  请安装: pip install git-filter-repo 后重新运行"
    else
        # 生成 Python blob-callback 脚本供 git-filter-repo 使用
        REPLACE_CALLBACK=$(mktemp --suffix=.py)
        {
            echo "import sys"
            echo "REPLACE_RULES = {"
            for rule in "${CUSTOM_REPLACE_RULES[@]}"; do
                IFS=':' read -r r_file r_old r_new <<< "$rule"
                [ -z "$r_file" ] || [ -z "$r_old" ] && continue
                # 转义 Python 字符串中的特殊字符
                r_old_escaped=$(echo "$r_old" | sed "s/'/\\\\'/g")
                r_new_escaped=$(echo "$r_new" | sed "s/'/\\\\'/g")
                echo "    b'${r_file}': (b'${r_old_escaped}', b'${r_new_escaped}'),"
            done
            echo "}"
            echo ""
            echo "fp = file_path.decode('utf-8', errors='replace')"
            echo "if fp in REPLACE_RULES:"
            echo "    old, new = REPLACE_RULES[fp]"
            echo "    try:"
            echo "        text = blob.decode('utf-8')"
            echo "        blob = text.replace(old.decode(), new.decode()).encode('utf-8')"
            echo "    except: pass"
        } > "$REPLACE_CALLBACK"

        git filter-repo --blob-callback "$(cat "$REPLACE_CALLBACK")" --force 2>&1 || {
            warn "  内容替换执行失败（文件删除不受影响）"
        }
        rm -f "$REPLACE_CALLBACK"

        # 内容替换后需要再次清理引用
        git reflog expire --expire=now --all 2>/dev/null
        git gc --prune=now --aggressive 2>/dev/null

        info "  内容替换完成"
    fi
fi

echo ""

# ----- 第 7 步：生成报告 -----
NEW_COMMIT=$(git rev-parse --short HEAD)
INFO_FILE="${REPO_ROOT}/scripts/SENSITIVE_CLEAN_REPORT.txt"

cat > "$INFO_FILE" << EOF
Git 敏感历史清除报告
生成时间: $(date)
仓库: $REPO_ROOT
清除工具: $TOOL
原始 HEAD: $CURRENT_COMMIT
新 HEAD: $NEW_COMMIT

已清除的文件:
$(for f in "${SENSITIVE_FILES[@]}"; do echo "  [高危] $f"; done)
$(for f in "${TEST_ROUTE_FILES[@]}"; do echo "  [中危] $f"; done)
  [低危] ${BACKUP_COUNT} 个备份文件 (.bak/.backup)

⚠️ 上线前必须完成:
1. 轮换 SUPABASE_SERVICE_ROLE_KEY (在 Supabase Dashboard > Settings > API)
2. 轮换 DEEPSEEK_API_KEY (在 DeepSeek 控制台)
3. 轮换 LAOZHANG_API_KEY (在 LaoZhang.ai 控制台)
4. Force push 到远程仓库: git push --force --all
5. 通知所有协作者重新 clone 仓库
6. 检查 GitHub/GitLab 是否有 fork 仓库也需要清除

备份位置: $BACKUP_DIR
EOF

info "报告已保存到: $INFO_FILE"

if [ "$ALL_CLEAR" = true ]; then
    echo ""
    info "=========================================="
    info "  敏感历史清除完成！"
    info "=========================================="
    echo ""
    warn "下一步操作："
    echo ""
    echo "  1. 轮换所有已泄露的密钥（见上方报告）"
    echo "  2. Force push 到远程仓库:"
    echo "     git push --force --all"
    echo ""
    echo "  3. 通知所有协作者丢弃本地仓库，重新 clone"
    echo ""
    echo "  4. 如需回滚，备份位于:"
    echo "     $BACKUP_DIR"
    echo ""
else
    error "部分敏感数据未被清除，请检查上方输出"
fi
