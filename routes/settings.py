"""
routes/settings.py — маршруты: Настройки
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

settings_bp = Blueprint("settings", __name__)

@settings_bp.route("/api/settings", methods=["GET", "POST"])
def settings():
    if request.method == "GET":
        row = qone("SELECT value FROM settings WHERE user_id=? AND key='usd_rate'", (uid(),))
        return jsonify({"usd_rate": float(row["value"]) if row else 90})
    data = request.get_json(force=True)
    q("INSERT OR REPLACE INTO settings(user_id,key,value) VALUES(?,?,?)",
      (uid(), "usd_rate", str(data.get("usd_rate", 90))))
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Accounts
# ──────────────────────────────────────────────
