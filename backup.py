"""
backup.py — Автоматическое резервное копирование SQLite базы данных.

Что делает:
  • Каждые 24 часа (по умолчанию) создаёт копию finance.db в папке backups/
  • Хранит не более MAX_BACKUPS файлов — старые удаляются автоматически
  • Использует sqlite3.backup() — копия всегда целостная, даже при активных запросах
  • Работает в фоновом потоке, не тормозит сервер
  • Предоставляет функции для ручного бэкапа и списка копий
  • Отправляет копию в Telegram (если задан BACKUP_TG_BOT_TOKEN + BACKUP_TG_CHAT_ID)

Переменные окружения для Telegram-бэкапа:
  BACKUP_TG_BOT_TOKEN  — токен бота (можно тот же BOT_TOKEN что у приложения)
  BACKUP_TG_CHAT_ID    — ваш личный Telegram user_id
                         (узнать свой id: написать @userinfobot в Telegram)
"""

import os
import sqlite3
import threading
import logging
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Настройки (можно переопределить через переменные окружения) ──────────────
BACKUP_INTERVAL_HOURS = int(os.environ.get("BACKUP_INTERVAL_HOURS", 24))
MAX_BACKUPS           = int(os.environ.get("MAX_BACKUPS", 7))

# Telegram-бэкап (необязательно — работает без этого)
BACKUP_TG_BOT_TOKEN = os.environ.get("BACKUP_TG_BOT_TOKEN", "")
BACKUP_TG_CHAT_ID   = os.environ.get("BACKUP_TG_CHAT_ID", "")

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

    if BACKUP_TG_BOT_TOKEN and BACKUP_TG_CHAT_ID:
        logger.info("📨  Telegram backup enabled → chat_id=%s", BACKUP_TG_CHAT_ID)
    else:
        logger.info("ℹ️   Telegram backup disabled (задайте BACKUP_TG_BOT_TOKEN и BACKUP_TG_CHAT_ID)")

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

            result = {"ok": True, "file": filename, "size_kb": size_kb, "ts": timestamp}

            # Отправить копию в Telegram в фоне, чтобы не блокировать ответ
            if BACKUP_TG_BOT_TOKEN and BACKUP_TG_CHAT_ID:
                threading.Thread(
                    target=_send_to_telegram,
                    args=(dest, filename, size_kb, label),
                    daemon=True,
                    name="tg-backup-upload",
                ).start()

            return result

        except Exception as e:
            logger.error("❌ Backup failed: %s", e)
            if dest.exists():
                dest.unlink(missing_ok=True)
            return {"ok": False, "error": str(e)}


# ── Отправка в Telegram ───────────────────────────────────────────────────────

def _send_to_telegram(path: Path, filename: str, size_kb: int, label: str):
    """
    Отправляет файл бэкапа в Telegram через Bot API (sendDocument).
    Работает в отдельном потоке — не блокирует основной сервер.

    Никаких сторонних библиотек не нужно — только стандартный urllib.
    """
    try:
        caption = (
            f"💾 Бэкап базы данных\n"
            f"📅 {datetime.now().strftime('%d.%m.%Y %H:%M')}\n"
            f"📦 {size_kb} KB  •  {label}"
        )

        url = f"https://api.telegram.org/bot{BACKUP_TG_BOT_TOKEN}/sendDocument"

        # Собираем multipart/form-data вручную
        boundary = "----BackupBoundary7f3a9b2c"
        body_parts = []

        # Поле chat_id
        body_parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="chat_id"\r\n\r\n'
            f"{BACKUP_TG_CHAT_ID}\r\n"
        )

        # Поле caption
        body_parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="caption"\r\n\r\n'
            f"{caption}\r\n"
        )

        # Файл
        file_data = path.read_bytes()
        body_parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="document"; filename="{filename}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n"
        )

        body = (
            "".join(body_parts).encode("utf-8")
            + file_data
            + f"\r\n--{boundary}--\r\n".encode("utf-8")
        )

        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=60) as resp:
            status = resp.status
            if status == 200:
                logger.info("📨  Backup sent to Telegram: %s", filename)
            else:
                logger.warning("⚠️  Telegram API returned status %d", status)

    except Exception as e:
        # Не роняем сервер из-за ошибки отправки — просто логируем
        logger.error("❌ Failed to send backup to Telegram: %s", e)


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
