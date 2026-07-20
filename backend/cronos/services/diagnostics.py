import os
import platform
import shutil


def hardware_report() -> dict:
    disk = shutil.disk_usage(os.getcwd())
    ram_gb = _ram_gb()
    if ram_gb < 8:
        profile = "leve"
    elif ram_gb < 24:
        profile = "equilibrado"
    else:
        profile = "avancado"
    return {
        "system": platform.system(),
        "release": platform.release(),
        "processor": platform.processor(),
        "cpu_count": os.cpu_count() or 1,
        "ram_gb": ram_gb,
        "disk_total_gb": round(disk.total / (1024**3), 2),
        "disk_free_gb": round(disk.free / (1024**3), 2),
        "recommended_profile": profile,
        "gpu": "deteccao detalhada pendente",
    }


def _ram_gb() -> float:
    if platform.system().lower() == "windows":
        try:
            import ctypes

            class MemoryStatus(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            status = MemoryStatus()
            status.dwLength = ctypes.sizeof(MemoryStatus)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
            return round(status.ullTotalPhys / (1024**3), 2)
        except Exception:
            return 0
    return 0
