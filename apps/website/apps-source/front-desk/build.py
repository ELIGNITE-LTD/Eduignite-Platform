"""Package Teacher Attendance into an .eia.

    python apps-source/teacher-attendance/build.py

Writes dist/teacher-attendance-<version>.eia next to this file. There is no
compilation step: the web bundles are plain ES modules, so packaging is only
zipping the declared directories in a defined order.
"""

import json
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
INCLUDE_DIRS = ('server', 'web', 'assets', 'migrations')
INCLUDE_FILES = ('manifest.json', 'CHANGELOG.md')


def build() -> str:
    with open(os.path.join(HERE, 'manifest.json'), encoding='utf-8') as handle:
        manifest = json.load(handle)

    version = manifest['version']
    out_dir = os.path.join(HERE, 'dist')
    os.makedirs(out_dir, exist_ok=True)
    target = os.path.join(out_dir, f"{manifest['key'].replace('_', '-')}-{version}.eia")

    members = []
    for name in INCLUDE_FILES:
        path = os.path.join(HERE, name)
        if os.path.isfile(path):
            members.append((name, path))

    for directory in INCLUDE_DIRS:
        base = os.path.join(HERE, directory)
        if not os.path.isdir(base):
            continue
        for root, _dirs, files in os.walk(base):
            for filename in sorted(files):
                if filename.endswith(('.pyc', '.map')) or filename.startswith('.'):
                    continue
                full = os.path.join(root, filename)
                relative = os.path.relpath(full, HERE).replace(os.sep, '/')
                members.append((relative, full))

    # Sorted and with fixed timestamps so the same source always produces the
    # same bytes — a build that differs run to run cannot be checksummed.
    members.sort(key=lambda item: item[0])
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for arcname, path in members:
            info = zipfile.ZipInfo(arcname, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(path, 'rb') as handle:
                archive.writestr(info, handle.read())

    print(f'built {target}')
    print(f'  {len(members)} files, {os.path.getsize(target)} bytes')
    return target


if __name__ == '__main__':
    build()
