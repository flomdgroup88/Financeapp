"""
routes/settings.py — Settings + gamification
"""
from flask import Blueprint, jsonify, request
from db import q, qone, qall, commit, uid

settings_bp = Blueprint("settings", __name__)

SETTINGS_KEYS = ["usd_rate", "eur_rate", "gbp_rate", "cny_rate", "default_currency", "nickname",
                 "xp_total", "streak_current", "streak_best", "streak_last_date"]

@settings_bp.route("/api/settings", methods=["GET", "PATCH", "POST"])
def settings():
    u = uid()
    if request.method == "GET":
        rows = qall("SELECT key, value FROM settings WHERE user_id=?", (u,))
        d = {r["key"]: r["value"] for r in rows}
        return jsonify({
            "usd_rate":          float(d.get("usd_rate", 90)),
            "eur_rate":          float(d.get("eur_rate", 98)),
            "gbp_rate":          float(d.get("gbp_rate", 115)),
            "cny_rate":          float(d.get("cny_rate", 12)),
            "default_currency":  d.get("default_currency", "RUB"),
            "nickname":          d.get("nickname", ""),
            "xp_total":          int(d.get("xp_total", 0)),
            "streak_current":    int(d.get("streak_current", 0)),
            "streak_best":       int(d.get("streak_best", 0)),
            "streak_last_date":  d.get("streak_last_date", None),
        })

    data = request.get_json(force=True)
    for key in SETTINGS_KEYS:
        if key in data and data[key] is not None:
            q("INSERT OR REPLACE INTO settings(user_id,key,value) VALUES(?,?,?)",
              (u, key, str(data[key])))
    commit()
    return jsonify({"ok": True})
