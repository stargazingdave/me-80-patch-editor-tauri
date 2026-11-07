import unittest
from installer_audit import audit_nsis

VALID = '\n'.join(['!define VERSION "0.2.1"','!define ARCH "x64"','!include "installer-hooks.nsh"','File "${MAINBINARYSRCPATH}"'])
class InstallerAuditTests(unittest.TestCase):
    def test_approved_payload_allows_cleanup_without_bundling_cli(self):
        audit_nsis(VALID+'\nDelete "$INSTDIR\\me80-discovery.exe"','0.2.1')
    def test_developer_executable_blocks_publication(self):
        with self.assertRaisesRegex(ValueError,'must not be bundled'):
            audit_nsis(VALID+'\nFile /a "/oname=me80-discovery.exe" "build/me80-discovery.exe"','0.2.1')
    def test_stale_version_blocks_publication(self):
        with self.assertRaisesRegex(ValueError,'version'):
            audit_nsis(VALID,'0.2.0')
    def test_wrong_architecture_blocks_publication(self):
        with self.assertRaisesRegex(ValueError,'architecture'):
            audit_nsis(VALID.replace('"x64"','"x86"'),'0.2.1')
if __name__=='__main__':unittest.main()
