"""
routes/backup.py — маршруты: Бэкап
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH
import backup as bkp

backup_bp = Blueprint("backup", __name__)


@backup_bp.route("/api/backup/list")
def api_backup_list():
    """GET /api/backup/list — список всех резервных копий."""
    return jsonify({"backups": bkp.list_backups()})


@backup_bp.route("/api/backup/create", methods=["POST"])
def api_backup_create():
    """POST /api/backup/create — создать копию прямо сейчас."""
    result = bkp.make_backup(label="manual")
    return jsonify(result), (200 if result["ok"] else 500)


@backup_bp.route("/api/backup/download/<filename>")
def api_backup_download(filename: str):
    """GET /api/backup/download/<filename> — скачать конкретную копию."""
    path = bkp.get_backup_path(filename)
    if path is None:
        return jsonify({"error": "Файл не найден"}), 404
    return send_file(
        str(path),
        as_attachment=True,
        download_name=filename,
        mimetype="application/octet-stream",
    )



