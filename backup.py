"""
backup.py — Автоматическое резервное копирование.

Что делает:
  • Каждые N часов (BACKUP_INTERVAL_HOURS, по умолчанию 6) создаёт:
      1. Бинарную копию finance.db  (backups/finance_backup_*.db)
      2. JSON-дамп всех данных      (backups/finance_backup_*.json)
         → JSON можно импортировать с любого устройства одной кнопкой
  • Хранит не более MAX_BACKUPS файлов каждого типа
  • sqlite3.backup() — копия всегда целостная даже при активных запросах
  • Работает в фоновом потоке, не тормозит сервер
  • Отправляет JSON-копию в Telegram (если задан BACKUP_TG_BOT_TOKEN)

Переменные окружения:
  BACKUP_INTERVAL_HOURS  — интервал в часах (default: 6)
  MAX_BACKUPS            — сколько копий хранить (default: 7)
  BACKUP_TG_BOT_TOKEN    — токен Telegram-бота
  BACKUP_TG_CHAT_ID      — ваш Telegram user_id (@userinfobot)
"""

import json
import logging
import os
import sqlite3
import threading
import urllib.request
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

BACKUP_INTERVAL_HOURS = int(os.environ.get("BACKUP_INTERVAL_HOURS", 6))
MAX_BACKUPS           = int(os.environ.get("MAX_BACKUPS", 7))

BACKUP_TG_BOT_TOKEN = os.environ.get("BACKUP_TG_BOT_TOKEN", "")
BACKUP_TG_CHAT_ID   = os.environ.get("BACKUP_TG_CHAT_ID", "")

_db_path: Path | None = None
_backup_dir: Path | None = None
_timer: threading.Timer | None = None
_lock = threading.Lock()


def init(db_path: str):
    global _db_path, _backup_dir

    _db_path    = Path(db_path)
    _backup_dir = _db_path.parent / "backups"
    _backup_dir.mkdir(exist_ok=True)

    logger.info("🗄️  Backup module init: db=%s, dir=%s, every=%dh, keep=%d",
                _db_path, _backup_dir, BACKUP_INTERVAL_HOURS, MAX_BACKUPS)

    if BACKUP_TG_BOT_TOKEN and BACKUP_TG_CHAT_ID:
        logger.info("📨  Telegram backup enabled → chat_id=%s", BACKUP_TG_CHAT_ID)

    _schedule_next()


# ── Создание бинарной копии БД ────────────────────────────────────────────────

def _make_db_backup(timestamp: str, label: str) -> Path | None:
    if not _db_path or not _db_path.exists():
        return None
    dest = _backup_dir / f"finance_backup_{timestamp}_{label}.db"
    try:
        src  = sqlite3.connect(str(_db_path))
        dst  = sqlite3.connect(str(dest))
        src.backup(dst, pages=100)
        dst.close()
        src.close()
        logger.info("✅ DB backup: %s (%d KB)", dest.name, dest.stat().st_size // 1024)
        return dest
    except Exception as e:
        logger.error("❌ DB backup failed: %s", e)
        if dest.exists():
            dest.unlink(missing_ok=True)
        return None


# ── Создание JSON-дампа (портируемый бэкап) ───────────────────────────────────

def _make_json_backup(timestamp: str, label: str) -> Path | None:
    """
    Выгружает все таблицы из БД в один JSON-файл.
    Формат: { "exported_at": "...", "tables": { "accounts": [...], ... } }
    JSON можно импортировать через /api/backup/restore одной кнопкой.
    """
    if not _db_path or not _db_path.exists():
        return None
    dest = _backup_dir / f"finance_backup_{timestamp}_{label}.json"

    TABLES = [
        "accounts", "categories", "transactions",
        "subscriptions", "planned_income", "budget_limits",
        "savings_goals", "recurring_transactions", "settings",
    ]

    try:
        conn = sqlite3.connect(str(_db_path))
        conn.row_factory = sqlite3.Row
        data = {"exported_at": datetime.now().isoformat(), "tables": {}}
        for tbl in TABLES:
            try:
                rows = conn.execute(f"SELECT * FROM {tbl}").fetchall()
                data["tables"][tbl] = [dict(r) for r in rows]
            except Exception:
                data["tables"][tbl] = []
        conn.close()

        dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("✅ JSON backup: %s (%d KB)", dest.name, dest.stat().st_size // 1024)
        return dest
    except Exception as e:
        logger.error("❌ JSON backup failed: %s", e)
        if dest.exists():
            dest.unlink(missing_ok=True)
        return None


# ── Публичная функция: создать оба бэкапа прямо сейчас ───────────────────────

def make_backup(label: str = "auto") -> dict:
    if _db_path is None or not _db_path.exists():
        return {"ok": False, "error": "База данных не найдена"}

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    with _lock:
        db_file   = _make_db_backup(timestamp, label)
        json_file = _make_json_backup(timestamp, label)

        _rotate_old_backups(".db")
        _rotate_old_backups(".json")

        result = {
            "ok":        bool(db_file or json_file),
            "ts":        timestamp,
            "db_file":   db_file.name   if db_file   else None,
            "json_file": json_file.name if json_file else None,
            "db_size_kb":   db_file.stat().st_size   // 1024 if db_file   else 0,
            "json_size_kb": json_file.stat().st_size // 1024 if json_file else 0,
        }

        if BACKUP_TG_BOT_TOKEN and BACKUP_TG_CHAT_ID and json_file:
            threading.Thread(
                target=_send_to_telegram,
                args=(json_file, json_file.name, result["json_size_kb"], label),
                daemon=True,
                name="tg-backup-upload",
            ).start()

        return result


# ── Ротация старых бэкапов ────────────────────────────────────────────────────

def _rotate_old_backups(ext: str = ".db"):
    if not _backup_dir:
        return
    files = sorted(
        _backup_dir.glob(f"finance_backup_*{ext}"),
        key=lambda f: f.stat().st_mtime,
    )
    while len(files) > MAX_BACKUPS:
        files.pop(0).unlink(missing_ok=True)


# ── Список бэкапов ────────────────────────────────────────────────────────────

def list_backups() -> list[dict]:
    if _backup_dir is None:
        return []
    files = sorted(
        list(_backup_dir.glob("finance_backup_*.db")) +
        list(_backup_dir.glob("finance_backup_*.json")),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    result = []
    for f in files:
        stat = f.stat()
        result.append({
            "file":       f.name,
            "type":       "json" if f.suffix == ".json" else "db",
            "size_kb":    stat.st_size // 1024,
            "created_at": datetime.fromtimestamp(stat.st_mtime).strftime("%d.%m.%Y %H:%M"),
        })
    return result


def get_backup_path(filename: str) -> Path | None:
    if _backup_dir is None:
        return None
    p = (_backup_dir / filename).resolve()
    if _backup_dir.resolve() not in p.parents:
        return None
    if not p.exists():
        return None
    return p


# ── Отправка в Telegram ───────────────────────────────────────────────────────

def _send_to_telegram(path: Path, filename: str, size_kb: int, label: str):
    try:
        caption = (
            f"💾 Бэкап базы данных\n"
            f"📅 {datetime.now().strftime('%d.%m.%Y %H:%M')}\n"
            f"📦 {size_kb} KB  •  {label} (JSON — можно восстановить)"
        )
        url      = f"https://api.telegram.org/bot{BACKUP_TG_BOT_TOKEN}/sendDocument"
        boundary = "----BackupBoundary7f3a9b2c"
        parts    = []

        parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="chat_id"\r\n\r\n'
            f"{BACKUP_TG_CHAT_ID}\r\n"
        )
        parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="caption"\r\n\r\n'
            f"{caption}\r\n"
        )
        parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="document"; filename="{filename}"\r\n'
            f"Content-Type: application/json\r\n\r\n"
        )

        body = (
            "".join(parts).encode("utf-8")
            + path.read_bytes()
            + f"\r\n--{boundary}--\r\n".encode("utf-8")
        )

        urllib.request.urlopen(
            urllib.request.Request(
                url, data=body,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                method="POST",
            ),
            timeout=60,
        )
        logger.info("📨  JSON backup sent to Telegram: %s", filename)
    except Exception as e:
        logger.error("❌ Failed to send backup to Telegram: %s", e)


# ── Фоновый планировщик ───────────────────────────────────────────────────────

def _run_auto_backup():
    logger.info("⏰ Auto-backup triggered")
    result = make_backup(label="auto")
    if not result["ok"]:
        logger.error("Auto-backup error")
    _schedule_next()


def _schedule_next():
    global _timer
    interval_sec = BACKUP_INTERVAL_HOURS * 3600
    _timer = threading.Timer(interval_sec, _run_auto_backup)
    _timer.daemon = True
    _timer.start()
    logger.info("⏭️  Next auto-backup in %d hours", BACKUP_INTERVAL_HOURS)


def stop():
    global _timer
    if _timer:
        _timer.cancel()
        _timer = None
