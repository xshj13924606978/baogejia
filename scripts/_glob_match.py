#!/usr/bin/env python3
"""
Glob pattern matcher for clean-sensitive-history.sh.

Usage:
    _glob_match.py <hist_files> <entries> <matched_out> <expanded_out> <unmatched_out> <exact_out>

Input files:
    hist_files:  one file path per line (all files in git history)
    entries:     tab-separated: TYPE\tIDX\tVALUE
                 TYPE = GLOB (wildcard pattern) or EXACT (literal path)
Output files:
    matched_out:        files matched by glob patterns
    expanded_out:       glob patterns that matched, with count (PATTERN\tCOUNT)
    unmatched_out:      glob patterns that matched nothing
    exact_out:          exact paths
"""
import re
import sys
from functools import lru_cache


def segment_match(pattern, string):
    """Match a single path segment. * does NOT match /."""
    regex = ''.join(
        '[^/]*' if c == '*' else '[^/]' if c == '?' else re.escape(c)
        for c in pattern
    )
    return bool(re.fullmatch(regex, string))


def glob_match(pattern, path):
    """gitignore-style glob match.
    *  matches any chars except / (within one path segment)
    ** matches zero or more path segments
    ?  matches any single char except /
    """
    if '*' not in pattern and '?' not in pattern:
        return pattern == path

    pat_parts = [p for p in pattern.split('/') if p]
    path_parts = [p for p in path.split('/') if p]

    @lru_cache(maxsize=None)
    def match(pi, si):
        if pi == len(pat_parts) and si == len(path_parts):
            return True
        if pi == len(pat_parts):
            return False
        if si == len(path_parts):
            return all(p == '**' for p in pat_parts[pi:])

        p = pat_parts[pi]
        s = path_parts[si]

        if p == '**':
            # Match zero segments (skip **) or one+ segments
            return match(pi + 1, si) or match(pi, si + 1)

        if segment_match(p, s):
            return match(pi + 1, si + 1)

        return False

    return match(0, 0)


def main():
    hist_file_path = sys.argv[1]
    entries_path = sys.argv[2]
    matched_out_path = sys.argv[3]
    expanded_out_path = sys.argv[4]
    unmatched_out_path = sys.argv[5]
    exact_out_path = sys.argv[6]

    # Read history files
    with open(hist_file_path, 'r') as f:
        hist_files = [line.strip() for line in f if line.strip()]

    # Read entries
    glob_patterns = []
    exact_paths = []
    with open(entries_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('\t', 2)
            entry_type = parts[0]
            value = parts[2] if len(parts) > 2 else ''
            if entry_type == 'GLOB':
                glob_patterns.append(value)
            elif entry_type == 'EXACT':
                exact_paths.append(value)

    # Match glob patterns
    matched_files = set()
    expanded = []
    unmatched = []

    for pattern in glob_patterns:
        matches = [f for f in hist_files if glob_match(pattern, f)]
        if matches:
            matched_files.update(matches)
            expanded.append(f"{pattern}\t{len(matches)}")
        else:
            unmatched.append(pattern)

    # Write outputs
    with open(matched_out_path, 'w') as f:
        for path in sorted(matched_files):
            f.write(path + '\n')

    with open(expanded_out_path, 'w') as f:
        for line in expanded:
            f.write(line + '\n')

    with open(unmatched_out_path, 'w') as f:
        for pattern in unmatched:
            f.write(pattern + '\n')

    with open(exact_out_path, 'w') as f:
        for path in exact_paths:
            f.write(path + '\n')


if __name__ == '__main__':
    main()
