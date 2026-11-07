"""Validate the actual generated installer payload before public distribution."""
import re

def audit_nsis(script, version):
    if not re.search(r'^!define VERSION "'+re.escape(version)+r'"$',script,re.M):
        raise ValueError('Installer version differs from approved source')
    if not re.search(r'^!define ARCH "x64"$',script,re.M):
        raise ValueError('Installer architecture differs from approved target')
    if re.search(r'^\s*File\b[^\r\n]*me80-discovery\.exe',script,re.M|re.I):
        raise ValueError('Developer discovery CLI must not be bundled')
    if 'File "${MAINBINARYSRCPATH}"' not in script:
        raise ValueError('Missing main application payload')
    if 'installer-hooks.nsh' not in script:
        raise ValueError('Missing cleanup hook for retired development tool')
