import os
import platform
import shutil
import time

from cronos.core.config import settings
from cronos.services import embedding_service, llm_provider


def hardware_report() -> dict:
    disk = shutil.disk_usage(os.getcwd())
    memory = _memory_status()
    ram_gb = memory["total_gb"]
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
        "cpu_percent": _cpu_percent(),
        "ram_gb": memory["total_gb"],
        "ram_percent": memory["load_percent"],
        "disk_total_gb": round(disk.total / (1024**3), 2),
        "disk_free_gb": round(disk.free / (1024**3), 2),
        "disk_percent": round((1 - disk.free / disk.total) * 100, 1) if disk.total else 0,
        "recommended_profile": profile,
        "gpu": "deteccao detalhada pendente",
        "gpu_percent": None,
        "vram_gb": None,
        "gpu_temperature_c": None,
    }


def core_health() -> dict:
    llm = llm_provider.status()
    embeddings = embedding_service.provider_status()
    whisper_manifest = settings.resource_dir / "voice" / "whisper" / "manifest.json"
    return {
        "application": {
            "status": "ready",
            "version": settings.version,
            "lastChecked": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "recommendedAction": "Validar componentes locais pendentes antes da Fase 6.",
        },
        "backendLocal": {
            "status": "ready",
            "version": settings.version,
            "bind": "127.0.0.1",
        },
        "database": {
            "status": "ready" if settings.db_path.exists() else "missing",
            "path": str(settings.db_path),
        },
        "llmRuntime": llm,
        "llmModel": {
            "status": "ready" if llm.get("ready") else "not_installed",
            "model": llm.get("model"),
            "error": llm.get("error"),
            "recommendedAction": "Importar llama-server.exe e modelo GGUF por canal aprovado.",
        },
        "embeddings": embeddings,
        "vectorIndex": {
            "status": "requires-document-validation",
            "recommendedAction": "Executar indexacao real apos importar documentos de teste.",
        },
        "storage": {
            "status": "ready" if settings.data_dir.exists() else "missing",
            "path": str(settings.data_dir),
        },
        "pdfExtractor": {
            "status": "available",
            "recommendedAction": "Validar PDF com texto selecionavel e PDF imagem separado.",
        },
        "whisper": {
            "status": "configured" if whisper_manifest.exists() else "not_installed",
            "manifest": str(whisper_manifest),
            "recommendedAction": "Importar ggml-base.bin oficial antes da validacao de voz.",
        },
        "tts": {
            "status": "pending-real-validation",
            "recommendedAction": "Validar reproducao local apos Chat real aprovado.",
        },
    }


def _memory_status() -> dict:
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
            return {
                "total_gb": round(status.ullTotalPhys / (1024**3), 2),
                "load_percent": float(status.dwMemoryLoad),
            }
        except Exception:
            return {"total_gb": 0, "load_percent": 0}
    return {"total_gb": 0, "load_percent": 0}


def _cpu_times_windows() -> tuple[int, int] | None:
    if platform.system().lower() != "windows":
        return None
    try:
        import ctypes

        idle = ctypes.c_ulonglong()
        kernel = ctypes.c_ulonglong()
        user = ctypes.c_ulonglong()
        ok = ctypes.windll.kernel32.GetSystemTimes(
            ctypes.byref(idle),
            ctypes.byref(kernel),
            ctypes.byref(user),
        )
        if not ok:
            return None
        idle_time = idle.value
        total_time = kernel.value + user.value
        return idle_time, total_time
    except Exception:
        return None


def _cpu_percent() -> float:
    first = _cpu_times_windows()
    if first is None:
        return 0
    time.sleep(0.1)
    second = _cpu_times_windows()
    if second is None:
        return 0
    idle_delta = second[0] - first[0]
    total_delta = second[1] - first[1]
    if total_delta <= 0:
        return 0
    return round(max(0, min(100, 100 * (1 - idle_delta / total_delta))), 1)
