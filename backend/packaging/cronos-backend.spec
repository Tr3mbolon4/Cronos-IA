# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

project_root = Path(SPECPATH).parents[1]
backend_root = project_root / "backend"
entrypoint = backend_root / "cronos" / "server.py"
runtime_hook = backend_root / "packaging" / "runtime-hook.py"

a = Analysis(
    [str(entrypoint)],
    pathex=[str(backend_root)],
    binaries=[],
    datas=[],
    hiddenimports=[
        "pypdf",
        "pypdf._crypt_providers._base",
        "pypdf._crypt_providers._cryptography",
        "pypdf._crypt_providers._fallback",
    ],
    hookspath=[str(backend_root / "packaging" / "hooks")],
    hooksconfig={},
    runtime_hooks=[str(runtime_hook)],
    excludes=[
        "fastapi",
        "uvicorn",
        "pydantic",
        "pytest",
        "httpx",
        "psutil",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

console_exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="cronos-backend-console",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

production_exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="cronos-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=True,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
