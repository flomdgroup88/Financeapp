"""
backup.py — Автоматическое резервное копирование SQLite базы данных.

Что делает:
  • Каждые 24 часа (по умолчанию) создаёт копию finance.db в папке backups/
  • Хранит не более MAX_BACKUPS файлов — старые удаляются автоматически
  • Использует sqlite3.backup() — копия всегда целостная, даже при активных запросах
  • Работает в фоновом потоке, не тормозит сервер
  • Предоставляет функции для ручного бэкапа и списка копий
"""

import os
import sqlite3
import threading
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Настройки (можно переопределить через переменные окружения) ──────────────
BACKUP_INTERVAL_HOURS = int(os.environ.get("BACKUP_INTERVAL_HOURS", 24))
MAX_BACKUPS           = int(os.environ.get("MAX_BACKUPS", 7))

_db_path: Path | None = None
_backup_dir: Path | None = None
_timer: threading.Timer | None = None
_lock = threading.Lock()


def init(db_path: str):
    """
    Вызвать один раз при старте приложения.
    db_path — путь к основному файлу finance.db
    """
    global _db_path, _backup_dir

    _db_path = Path(db_path)
    # Папка backups/ рядом с базой данных
    _backup_dir = _db_path.parent / "backups"
    _backup_dir.mkdir(exist_ok=True)

    logger.info("🗄️  Backup module init: db=%s, dir=%s, every=%dh, keep=%d",
                _db_path, _backup_dir, BACKUP_INTERVAL_HOURS, MAX_BACKUPS)

    _schedule_next()


# ── Создание копии ────────────────────────────────────────────────────────────

def make_backup(label: str = "auto") -> dict:
    """
    Создаёт резервную копию прямо сейчас.
    Возвращает {"ok": True/False, "file": "...", "size_kb": ...}
    """
    if _db_path is None or not _db_path.exists():
        return {"ok": False, "error": "База данных не найдена"}

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename  = f"finance_backup_{timestamp}_{label}.db"
    dest      = _backup_dir / filename

    with _lock:
        try:
            # sqlite3.backup() корректно работает с WAL-режимом
            src_conn  = sqlite3.connect(str(_db_path))
            dest_conn = sqlite3.connect(str(dest))
            src_conn.backup(dest_conn, pages=100)   # pages=100 → не блокирует надолго
            dest_conn.close()
            src_conn.close()

            size_kb = dest.stat().st_size // 1024
            logger.info("✅ Backup created: %s (%d KB)", filename, size_kb)

            _rotate_old_backups()

            return {"ok": True, "file": filename, "size_kb": size_kb, "ts": timestamp}

        except Exception as e:
            logger.error("❌ Backup failed: %s", e)
            if dest.exists():
                dest.unlink(missing_ok=True)
            return {"ok": False, "error": str(e)}


def _rotate_old_backups():
    """Удаляет самые старые файлы, если их больше MAX_BACKUPS."""
    files = sorted(_backup_dir.glob("finance_backup_*.db"), key=lambda f: f.stat().st_mtime)
    while len(files) > MAX_BACKUPS:
        oldest = files.pop(0)
        oldest.unlink(missing_ok=True)
        logger.info("🗑️  Old backup removed: %s", oldest.name)


# ── Список копий ─────────────────────────────────────────────────────────────

def list_backups() -> list[dict]:
    """Возвращает список копий: имя, размер, дата — от новых к старым."""
    if _backup_dir is None:
        return []
    files = sorted(_backup_dir.glob("finance_backup_*.db"),
                   key=lambda f: f.stat().st_mtime, reverse=True)
    result = []
    for f in files:
        stat = f.stat()
        result.append({
            "file":       f.name,
            "size_kb":    stat.st_size // 1024,
            "created_at": datetime.fromtimestamp(stat.st_mtime).strftime("%d.%m.%Y %H:%M"),
        })
    return result


def get_backup_path(filename: str) -> Path | None:
    """Возвращает Path к файлу копии (или None если не найден / попытка path traversal)."""
    if _backup_dir is None:
        return None
    p = (_backup_dir / filename).resolve()
    # Защита от path traversal: файл должен лежать строго в папке backups
    if _backup_dir.resolve() not in p.parents:
        return None
    if not p.exists():
        return None
    return p


# ── Фоновый планировщик ───────────────────────────────────────────────────────

def _run_auto_backup():
    """Запускается в фоновом потоке по таймеру."""
    logger.info("⏰ Auto-backup triggered")
    result = make_backup(label="auto")
    if not result["ok"]:
        logger.error("Auto-backup error: %s", result.get("error"))
    _schedule_next()


def _schedule_next():
    """Ставит следующий таймер через BACKUP_INTERVAL_HOURS часов."""
    global _timer
    interval_sec = BACKUP_INTERVAL_HOURS * 3600
    _timer = threading.Timer(interval_sec, _run_auto_backup)
    _timer.daemon = True   # Поток умрёт вместе с процессом gunicorn
    _timer.start()
    logger.info("⏭️  Next auto-backup in %d hours", BACKUP_INTERVAL_HOURS)


def stop():
    """Отменяет запланированный таймер (вызывать при остановке сервера)."""
    global _timer
    if _timer:
        _timer.cancel()
        _timer = None
