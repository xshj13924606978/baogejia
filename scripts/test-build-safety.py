"""Exercise the build wrapper with fake tools; never installs or builds the app."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('build.sh').resolve()

class BuildSafety(unittest.TestCase):
    def scenario(self, build_rc=0, install_rc=0, existing=True, type_rc=0):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            original = b'// uncommitted custom type references\n'
            if existing:
                (root / 'next-env.d.ts').write_bytes(original)
            tools = {
                'pnpm': f'#!/bin/sh\nif [ \"$1\" = exec ]; then exit {type_rc}; fi\nexit {install_rc}\n',
                'npx': f'#!/bin/sh\necho generated > next-env.d.ts\necho "✓ Compiled successfully"\necho "_global-error prerender failed"\nexit {build_rc}\n',
            }
            for name, content in tools.items():
                p = bin_dir / name
                p.write_text(content)
                p.chmod(0o755)
            env = {**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH'], 'COZE_WORKSPACE_PATH': tmp}
            result = subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True)
            self.assertEqual(result.returncode, install_rc or type_rc or build_rc)
            if existing:
                self.assertEqual((root / 'next-env.d.ts').read_bytes(), original)
            else:
                self.assertFalse((root / 'next-env.d.ts').exists())
    def test_failure_with_previously_ignored_text(self): self.scenario(build_rc=7)
    def test_type_failure_blocks_build(self): self.scenario(type_rc=4)
    def test_success_preserves_local_changes(self): self.scenario()
    def test_install_failure_preserves_local_changes(self): self.scenario(install_rc=3)
    def test_generated_file_removed_if_originally_absent(self): self.scenario(existing=False)

if __name__ == '__main__': unittest.main()
