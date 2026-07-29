#!/usr/bin/env python3
"""Unit tests for scripts/_glob_match.py"""
import os
import subprocess
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts._glob_match import glob_match, segment_match


# ── segment_match ──────────────────────────────────────────────


class TestSegmentMatch(unittest.TestCase):
    def test_exact(self):
        self.assertTrue(segment_match("app.ts", "app.ts"))

    def test_star_wildcard(self):
        # * matches any chars except /
        self.assertTrue(segment_match("*.bak", "tsconfig.json.bak"))
        self.assertTrue(segment_match("*.bak", "file.bak"))

    def test_star_matches_empty(self):
        # * is [^/]*, can match zero characters
        self.assertTrue(segment_match("*.bak", ".bak"))

    def test_star_no_slash(self):
        # * does not match /
        self.assertFalse(segment_match("*.bak", "src/app.bak"))

    def test_question_mark(self):
        self.assertTrue(segment_match("file?.txt", "file1.txt"))
        self.assertTrue(segment_match("file?.txt", "fileA.txt"))

    def test_question_mark_requires_one(self):
        self.assertFalse(segment_match("file?.txt", "file.txt"))
        self.assertFalse(segment_match("file?.txt", "file12.txt"))

    def test_question_mark_no_slash(self):
        self.assertFalse(segment_match("a?c", "a/c"))

    def test_literal_chars(self):
        self.assertFalse(segment_match("app.ts", "app.tsx"))

    def test_empty_both(self):
        self.assertTrue(segment_match("", ""))

    def test_empty_pattern(self):
        self.assertFalse(segment_match("", "a"))

    def test_empty_string(self):
        self.assertFalse(segment_match("a", ""))


# ── glob_match: exact (no wildcards) ──────────────────────────


class TestGlobExact(unittest.TestCase):
    def test_match(self):
        self.assertTrue(glob_match("src/app.ts", "src/app.ts"))

    def test_no_match_suffix(self):
        self.assertFalse(glob_match("src/app.ts", "src/app.tsx"))

    def test_no_match_prefix(self):
        self.assertFalse(glob_match("src/app.ts", "lib/app.ts"))

    def test_no_match_extra_segment(self):
        self.assertFalse(glob_match("src/app.ts", "src/pages/app.ts"))


# ── glob_match: single * ──────────────────────────────────────


class TestGlobSingleStar(unittest.TestCase):
    def test_star_in_last_segment(self):
        self.assertTrue(glob_match("*.bak", "tsconfig.json.bak"))

    def test_star_no_cross_slash(self):
        self.assertFalse(glob_match("*.bak", "src/app.ts.bak"))

    def test_star_in_middle_segment(self):
        self.assertTrue(glob_match("src/app/api/test/*", "src/app/api/test/file.ts"))

    def test_star_no_cross_two_layers(self):
        self.assertFalse(glob_match("src/app/api/test/*", "src/app/api/test/sub/file.ts"))


# ── glob_match: ** ─────────────────────────────────────────────


class TestGlobDoubleStar(unittest.TestCase):
    def test_double_star_deep(self):
        self.assertTrue(glob_match("src/app/api/test/**", "src/app/api/test/sub/deep/file.ts"))

    def test_double_star_zero_segments(self):
        self.assertTrue(glob_match("src/app/api/test/**", "src/app/api/test/"))

    def test_double_star_prefix(self):
        self.assertTrue(glob_match("**/*.bak", "src/app/api/admin/route.ts.bak"))

    def test_double_star_prefix_root(self):
        self.assertTrue(glob_match("**/*.bak", "tsconfig.json.bak"))

    def test_double_star_mid_zero(self):
        # ** matches zero segments — but the last pattern segment after **
        # will also consume one path segment, leaving a "dangling" segment.
        # In this implementation, `**/test*` with zero ** means test* matches
        # `test-db` and `route.ts` is left unmatched. Document this behavior:
        self.assertFalse(
            glob_match("src/app/api/admin/**/test*",
                       "src/app/api/admin/test-db/route.ts")
        )
        # It DOES match when there's no dangling segment after test*
        self.assertTrue(
            glob_match("src/app/api/admin/**/test*",
                       "src/app/api/admin/test-db")
        )
        # And it matches when ** actually consumes at least one segment
        self.assertTrue(
            glob_match("src/app/api/admin/**/test*/route.ts",
                       "src/app/api/admin/test-db/route.ts")
        )

    def test_double_star_mid_no_match(self):
        self.assertFalse(glob_match("src/app/api/admin/**/test*", "src/app/api/other/route.ts"))

    def test_double_star_mid_deep(self):
        self.assertTrue(glob_match("src/app/api/admin/**/test*", "src/app/api/admin/x/y/test-file.ts"))


# ── glob_match: nested ** ─────────────────────────────────────


class TestGlobNestedDoubleStar(unittest.TestCase):
    def test_nested_star_first_zero(self):
        self.assertTrue(glob_match("src/app/api/admin/**/*test*/**", "src/app/api/admin/test-permission/route.ts"))

    def test_nested_star_mid(self):
        self.assertTrue(glob_match("src/app/api/admin/**/*test*/**", "src/app/api/admin/permission-test/all/route.ts"))

    def test_nested_star_deep(self):
        self.assertTrue(glob_match("src/app/api/admin/**/*test*/**", "src/app/api/admin/a/b/c-test-d/e/f/g.ts"))

    def test_nested_star_no_match(self):
        self.assertFalse(glob_match("src/app/api/admin/**/*test*/**", "src/app/api/admin/nothing/route.ts"))


# ── glob_match: ? wildcard ─────────────────────────────────────


class TestGlobQuestionMark(unittest.TestCase):
    def test_match_one_char(self):
        self.assertTrue(glob_match("file?.txt", "file1.txt"))

    def test_no_match_two_chars(self):
        self.assertFalse(glob_match("file?.txt", "file12.txt"))

    def test_no_match_zero_chars(self):
        self.assertFalse(glob_match("file?.txt", "file.txt"))

    def test_question_in_middle_segment(self):
        self.assertTrue(glob_match("src/app?/api.ts", "src/app1/api.ts"))
        self.assertFalse(glob_match("src/app?/api.ts", "src/app/api.ts"))


# ── glob_match: edge cases ─────────────────────────────────────


class TestGlobEdgeCases(unittest.TestCase):
    def test_double_star_matches_empty(self):
        self.assertTrue(glob_match("**", ""))

    def test_double_star_matches_root_file(self):
        self.assertTrue(glob_match("**", "file.ts"))

    def test_double_star_matches_deep_file(self):
        self.assertTrue(glob_match("**", "a/b/c/d/e/f.ts"))

    def test_star_suffix_zero(self):
        # src/** matches src/file.ts (** matches zero segments)
        self.assertTrue(glob_match("src/**", "src/file.ts"))

    def test_pattern_same_as_path_with_wildcard(self):
        self.assertTrue(glob_match("src/*/app.ts", "src/pages/app.ts"))
        self.assertFalse(glob_match("src/*/app.ts", "src/app.ts"))

    def test_trailing_slash_pattern(self):
        # Trailing / in pattern is stripped when splitting
        self.assertTrue(glob_match("src/**", "src/"))


# ── glob_match: no-match scenarios ────────────────────────────


class TestGlobNoMatch(unittest.TestCase):
    def test_star_at_least_one_char(self):
        # * maps to [^/]* which CAN match zero chars in our implementation
        # So "*.bak" DOES match ".bak" — test that explicitly
        self.assertTrue(glob_match("*.bak", ".bak"))

    def test_nonexistent_pattern(self):
        self.assertFalse(glob_match("nonexistent/**/*.txt", "src/app/api/test.txt"))
        # When ** matches zero segments, the pattern reduces to
        # `nonexistent/*.txt`, which DOES match `nonexistent/file.txt`.
        # This matches gitignore semantics where **/ at the start is optional.
        # So test a truly non-matching case instead:
        self.assertFalse(glob_match("nonexistent/**/*.txt", "nonexistent/file.ts"))
        self.assertFalse(glob_match("nonexistent/**/*.txt", "other/file.txt"))

    def test_completely_different(self):
        self.assertFalse(glob_match("docs/**/*.md", "src/app.ts"))

    # ── 路径层级不匹配 ──────────────────────────────────────────

    def test_pattern_shorter_than_path(self):
        """pattern 段数少于 path 段数，且无 ** 兜底"""
        self.assertFalse(glob_match("src/app.ts", "src/app/api/route.ts"))

    def test_pattern_longer_than_path(self):
        """pattern 段数多于 path 段数"""
        self.assertFalse(glob_match("src/app/api/route.ts", "src/app.ts"))

    def test_single_star_cannot_reach_deeper(self):
        """单层 * 无法匹配更深层级的文件"""
        self.assertFalse(glob_match("src/*", "src/app/api.ts"))
        self.assertFalse(glob_match("src/*", "src/a/b.ts"))

    def test_single_star_cannot_match_parent(self):
        """单层 * 不能向上匹配父目录"""
        self.assertFalse(glob_match("src/*/api.ts", "src/api.ts"))

    # ── ** 边界不匹配 ───────────────────────────────────────────

    def test_double_star_with_fixed_prefix_no_match(self):
        """** 前的固定前缀必须匹配"""
        self.assertFalse(glob_match("docs/**/*.md", "src/docs/readme.md"))
        self.assertFalse(glob_match("docs/**/*.md", "src/app/readme.md"))

    def test_double_star_with_fixed_suffix_no_match(self):
        """** 后的固定后缀必须匹配"""
        self.assertFalse(glob_match("src/**/*.test.ts", "src/app/api/route.ts"))
        self.assertFalse(glob_match("src/**/*.test.ts", "src/app/api/route.test.jsx"))

    def test_double_star_segment_mismatch(self):
        """** 后的段必须与路径中某段匹配"""
        self.assertFalse(glob_match("src/**/api.ts", "src/app/route.ts"))
        self.assertFalse(glob_match("src/**/api.ts", "src/app/api/route.ts"))

    def test_double_star_cannot_match_zero_when_trailing_segment_required(self):
        """** 后有固定段时，** 不能让该段落空"""
        # **/test 要求至少匹配到一个名为 test* 的段
        self.assertFalse(glob_match("src/**/test", "src/app/route.ts"))
        self.assertFalse(glob_match("src/**/test", "src/app"))

    # ── 嵌套 ** 不匹配 ─────────────────────────────────────────

    def test_nested_double_star_no_matching_segment(self):
        """嵌套 ** 模式中中间段不匹配"""
        self.assertFalse(
            glob_match("src/**/*test*/**", "src/app/nothing/route.ts")
        )
        self.assertFalse(
            glob_match("src/**/*test*/**", "src/app/a/b/c.ts")
        )

    def test_nested_double_star_wrong_extension(self):
        """嵌套 ** 模式末尾段不匹配"""
        self.assertFalse(
            glob_match("src/**/*test*/**/*.ts", "src/app/test-dir/readme.md")
        )

    # ── ? 通配符不匹配 ──────────────────────────────────────────

    def test_question_mark_no_match_across_slash(self):
        """? 不能匹配 /"""
        self.assertFalse(glob_match("src/app?api.ts", "src/app/api.ts"))

    def test_question_mark_insufficient_chars(self):
        """? 需要恰好一个字符"""
        self.assertFalse(glob_match("src/app?/api.ts", "src/app/api.ts"))
        self.assertFalse(glob_match("src/app?/api.ts", "src/app12/api.ts"))

    def test_question_mark_in_multi_segment_pattern(self):
        """多段模式中 ? 不匹配"""
        self.assertFalse(glob_match("a?b/c?d.ts", "ab/cd.ts"))
        self.assertFalse(glob_match("a?b/c?d.ts", "aXb/cXYd.ts"))

    # ── 扩展名 / 后缀不匹配 ────────────────────────────────────

    def test_wrong_extension(self):
        """扩展名不同"""
        self.assertFalse(glob_match("*.bak", "file.backup"))
        self.assertFalse(glob_match("*.bak", "file.bak.tmp"))
        self.assertFalse(glob_match("*.test.ts", "file.test.tsx"))

    def test_extension_with_single_star(self):
        """单层 * 匹配扩展名时的边界"""
        self.assertFalse(glob_match("src/*.test.ts", "src/app.test.jsx"))
        self.assertFalse(glob_match("src/*.test.ts", "src/sub/app.test.ts"))

    # ── 大小写 / 特殊字符 ──────────────────────────────────────

    def test_case_sensitive(self):
        """匹配是大小写敏感的"""
        self.assertFalse(glob_match("src/App.ts", "src/app.ts"))
        self.assertFalse(glob_match("*.BAK", "file.bak"))
        self.assertFalse(glob_match("SRC/**/*.ts", "src/app.ts"))

    def test_special_chars_in_path(self):
        """路径中的正则特殊字符应被正确转义"""
        # . 在 pattern 中是字面量
        self.assertFalse(glob_match("app.ts", "appXts"))
        self.assertFalse(glob_match("a.b.c", "aXbXc"))
        # + 在 pattern 中是字面量
        self.assertFalse(glob_match("file+.ts", "fileee.ts"))
        # ( ) 在 pattern 中是字面量
        self.assertFalse(glob_match("file(x).ts", "fileyxy.ts"))

    # ── 空路径 / 空模式 ────────────────────────────────────────

    def test_empty_path_with_non_empty_pattern(self):
        """空路径不匹配非空模式"""
        self.assertFalse(glob_match("src/app.ts", ""))
        self.assertFalse(glob_match("*", ""))
        self.assertFalse(glob_match("src/*", ""))

    def test_empty_pattern_with_non_empty_path(self):
        """空模式不匹配非空路径"""
        self.assertFalse(glob_match("", "src/app.ts"))
        self.assertFalse(glob_match("", "file.ts"))

    # ── 实际项目路径综合场景 ───────────────────────────────────

    def test_realistic_admin_routes_no_match(self):
        """实际项目路径：admin 下不含 test 的路由不匹配 test 模式"""
        self.assertFalse(
            glob_match("src/app/api/admin/**/*test*/**",
                       "src/app/api/admin/users/route.ts")
        )
        self.assertFalse(
            glob_match("src/app/api/admin/**/*test*/**",
                       "src/app/api/admin/config/modules/route.ts")
        )

    def test_realistic_backup_patterns_no_match(self):
        """实际项目路径：非备份文件不匹配 .bak 模式"""
        self.assertFalse(glob_match("**/*.bak", "src/app/api/admin/route.ts"))
        self.assertFalse(glob_match("**/*.bak", "src/app/api/admin/route.ts.backup"))
        self.assertFalse(glob_match("**/*.bak", "README.md"))

    def test_realistic_test_dir_no_cross(self):
        """实际项目路径：test/ 下的文件不能被单层 * 匹配"""
        self.assertFalse(
            glob_match("src/app/api/test/*",
                       "src/app/api/test/basic-insert/route.ts")
        )


# ── 性能基准测试 ───────────────────────────────────────────────
#
# 从 git 历史中提取真实文件列表作为数据集。
# 可作为 unittest 运行（断言批量匹配在合理时间内完成），
# 也可通过 python3 scripts/_glob_match_test.py --benchmark 独立运行，
# 打印每个模式的耗时详情。


def _load_real_hist_files():
    """从 git 历史加载真实文件列表（带缓存）"""
    if not hasattr(_load_real_hist_files, '_cache'):
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        result = subprocess.run(
            ['git', 'log', '--all', '--full-history',
             '--diff-filter=A', '--name-only', '--pretty=format:'],
            capture_output=True, text=True, cwd=repo_root
        )
        files = sorted(set(f for f in result.stdout.strip().split('\n') if f))
        _load_real_hist_files._cache = files
    return _load_real_hist_files._cache


def _synthetic_deep_paths(count, depth, base='src'):
    """生成指定数量和深度的合成路径"""
    paths = []
    for i in range(count):
        parts = [base]
        for d in range(depth):
            parts.append(f"dir{i % 100}-{d}")
        parts.append(f"file{i}.ts")
        paths.append('/'.join(parts))
    return paths


def _run_benchmark(label, pattern, files):
    """对单个 pattern × 文件列表执行匹配，返回 (匹配数, 耗时秒)"""
    start = time.perf_counter()
    matched = 0
    for f in files:
        if glob_match(pattern, f):
            matched += 1
    elapsed = time.perf_counter() - start
    return matched, elapsed


# 基准测试配置：(label, pattern, 文件来源)
# 文件来源: 'real' = git 历史, 'synthetic_N' = N 条合成路径
_BENCHMARKS = [
    # ── 精确匹配（无通配符快速路径） ──
    ("精确匹配（快速路径）", "src/app.ts", 'real'),
    ("精确匹配不命中", "nonexistent/file.txt", 'real'),

    # ── 单层 * ──
    ("单层 *（根级）", "*.bak", 'real'),
    ("单层 *（深层）", "src/app/api/admin/*", 'real'),
    ("单层 *（不跨 /）", "src/app/api/test/*", 'real'),

    # ── 多层 ** ──
    ("** 递归（浅目录）", "src/app/api/test/**", 'real'),
    ("** 递归（全仓库）", "**/*.bak", 'real'),
    ("** 递归（深嵌套）", "**/*test*/**", 'real'),
    ("** 递归（长后缀）", "src/app/api/**/route.ts", 'real'),

    # ── 嵌套 **（回溯密集） ──
    ("嵌套 ** / **", "src/**/*test*/**/*.ts", 'real'),
    ("嵌套 ** / **（不命中）", "docs/**/*review*/**/*.md", 'real'),

    # ── ? 通配符 ──
    ("? 通配符", "src/app?/api.ts", 'real'),

    # ── 合成大数据集 ──
    ("合成 10k 路径 × **", "src/**/*.ts", 'synthetic_10000'),
    ("合成 10k 路径 × 嵌套 **", "src/**/*dir*/**/*.ts", 'synthetic_10000'),
    ("合成 50k 路径 × **", "src/**/*dir*/**/*.ts", 'synthetic_50000'),
]

# 阈值：单次 pattern × 全部历史文件必须在 1s 内完成
_PERF_THRESHOLD = 1.0

# 合成路径深度
_SYNTHETIC_DEPTH = 8


class TestGlobPerformance(unittest.TestCase):
    """性能基准测试：验证匹配在合理时间内完成"""

    @classmethod
    def setUpClass(cls):
        cls.real_files = _load_real_hist_files()
        cls.synthetic_10k = _synthetic_deep_paths(10000, _SYNTHETIC_DEPTH)
        cls.synthetic_50k = _synthetic_deep_paths(50000, _SYNTHETIC_DEPTH)

    def _get_files(self, source):
        if source == 'real':
            return self.real_files
        elif source == 'synthetic_10000':
            return self.synthetic_10k
        elif source == 'synthetic_50000':
            return self.synthetic_50k
        raise ValueError(f"Unknown file source: {source}")

    def test_real_dataset_not_empty(self):
        self.assertGreater(len(self.real_files), 100,
                           "git 历史文件数量过少，基准测试无意义")

    def test_benchmark_exact_match(self):
        matched, elapsed = _run_benchmark("精确匹配", "src/app.ts", self.real_files)
        self.assertLess(elapsed, _PERF_THRESHOLD,
                       f"精确匹配耗时 {elapsed:.4f}s 超过 {_PERF_THRESHOLD}s 阈值")

    def test_benchmark_single_star(self):
        matched, elapsed = _run_benchmark("单层 *", "*.bak", self.real_files)
        self.assertLess(elapsed, _PERF_THRESHOLD,
                       f"单层 * 耗时 {elapsed:.4f}s 超过 {_PERF_THRESHOLD}s 阈值")

    def test_benchmark_double_star(self):
        matched, elapsed = _run_benchmark("** 递归", "src/app/api/test/**", self.real_files)
        self.assertLess(elapsed, _PERF_THRESHOLD,
                       f"** 递归匹配耗时 {elapsed:.4f}s 超过 {_PERF_THRESHOLD}s 阈值")

    def test_benchmark_double_star_full_repo(self):
        matched, elapsed = _run_benchmark("** 全仓库", "**/*.bak", self.real_files)
        self.assertLess(elapsed, _PERF_THRESHOLD,
                       f"** 全仓库匹配耗时 {elapsed:.4f}s 超过 {_PERF_THRESHOLD}s 阈值")

    def test_benchmark_nested_double_star(self):
        matched, elapsed = _run_benchmark(
            "嵌套 **", "src/**/*test*/**/*.ts", self.real_files)
        self.assertLess(elapsed, _PERF_THRESHOLD,
                       f"嵌套 ** 匹配耗时 {elapsed:.4f}s 超过 {_PERF_THRESHOLD}s 阈值")

    def test_benchmark_synthetic_10k(self):
        _, elapsed = _run_benchmark(
            "合成 10k", "src/**/*.ts", self.synthetic_10k)
        self.assertLess(elapsed, _PERF_THRESHOLD,
                       f"合成 10k 路径匹配耗时 {elapsed:.4f}s 超过 {_PERF_THRESHOLD}s 阈值")

    def test_benchmark_synthetic_50k(self):
        _, elapsed = _run_benchmark(
            "合成 50k", "src/**/*dir*/**/*.ts", self.synthetic_50k)
        self.assertLess(elapsed, _PERF_THRESHOLD * 3,
                       f"合成 50k 路径匹配耗时 {elapsed:.4f}s 超过 {_PERF_THRESHOLD * 3}s 阈值")


def _print_benchmark_report():
    """打印详细的基准测试报告"""
    real_files = _load_real_hist_files()
    synthetic_10k = _synthetic_deep_paths(10000, _SYNTHETIC_DEPTH)
    synthetic_50k = _synthetic_deep_paths(50000, _SYNTHETIC_DEPTH)

    file_sources = {
        'real': real_files,
        'synthetic_10000': synthetic_10k,
        'synthetic_50000': synthetic_50k,
    }

    print()
    print("=" * 78)
    print("  Glob 匹配性能基准测试报告")
    print("=" * 78)
    print(f"  真实文件数: {len(real_files)}")
    print(f"  合成 10k 路径深度: {_SYNTHETIC_DEPTH}")
    print(f"  合成 50k 路径深度: {_SYNTHETIC_DEPTH}")
    print("=" * 78)
    print(f"  {'模式':<30} {'文件数':>8} {'匹配数':>8} {'耗时':>12} {'速率':>12}")
    print("  " + "-" * 74)

    for label, pattern, source in _BENCHMARKS:
        files = file_sources[source]
        matched, elapsed = _run_benchmark(label, pattern, files)
        rate = len(files) / elapsed if elapsed > 0 else float('inf')
        unit = "文件/s" if rate < 1e6 else "M文件/s"
        rate_str = f"{rate:,.0f} {unit}" if rate < 1e6 else f"{rate / 1e6:,.1f} M/s"
        status = "" if elapsed < _PERF_THRESHOLD else " ⚠ 慢"
        print(f"  {label:<30} {len(files):>8,} {matched:>8,} {elapsed:>10.4f}s {rate_str:>12}{status}")

    print("=" * 78)
    print()


if __name__ == "__main__":
    if '--benchmark' in sys.argv:
        sys.argv.remove('--benchmark')
        # 只运行基准报告，不运行断言测试
        _print_benchmark_report()
    else:
        unittest.main(verbosity=2)
