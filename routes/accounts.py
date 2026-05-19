"""
routes/accounts.py — маршруты: Счета
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

accounts_bp = Blueprint("accounts", __name__)

@accounts_bp.route("/api/bootstrap", methods=["GET"])
def bootstrap():
    """Возвращает все начальные данные одним запросом."""
    u = uid()
    settings_rows = {r["key"]: r["value"] for r in qall("SELECT key,value FROM settings WHERE user_id=?", (u,))}
    return jsonify({
        "accounts":      qall("SELECT * FROM accounts WHERE user_id=? ORDER BY sort_order, id", (u,)),
        "usd_rate":      float(settings_rows.get("usd_rate", 90)),
        "default_currency": settings_rows.get("default_currency", "RUB"),
        "nickname":      settings_rows.get("nickname", ""),
        "categories":    qall("SELECT * FROM categories WHERE user_id=? ORDER BY sort_order, id", (u,)),
        "subscriptions": qall("SELECT * FROM subscriptions WHERE user_id=? ORDER BY sort_order, id", (u,)),
        "planned_income":qall("SELECT * FROM planned_income WHERE user_id=? ORDER BY id", (u,)),
        "goals":         qall("SELECT * FROM savings_goals WHERE user_id=? ORDER BY id", (u,)),
        "recurring":     qall("SELECT * FROM recurring_transactions WHERE user_id=? ORDER BY id", (u,)),
        "gamification": {
            "xp_total":         int(settings_rows.get("xp_total", 0)),
            "streak_current":   int(settings_rows.get("streak_current", 0)),
            "streak_best":      int(settings_rows.get("streak_best", 0)),
            "streak_last_date": settings_rows.get("streak_last_date"),
        },
    })


@accounts_bp.route("/api/accounts", methods=["GET", "POST"])
def accounts():
    if request.method == "GET":
        rows = qall("SELECT * FROM accounts WHERE user_id=? ORDER BY sort_order, id", (uid(),))
        cfg  = qone("SELECT value FROM settings WHERE user_id=? AND key='usd_rate'", (uid(),))
        return jsonify({"accounts": rows, "usd_rate": float(cfg["value"]) if cfg else 90})
    d = request.get_json(force=True)
    count = qone("SELECT COUNT(*) AS v FROM accounts WHERE user_id=?", (uid(),))["v"]
    if count >= 20:
        return jsonify({"error": "Достигнут лимит: не более 20 счетов"}), 400
    if d.get("is_priority"):
        q("UPDATE accounts SET is_priority=0 WHERE user_id=?", (uid(),))
    max_order = qone("SELECT COALESCE(MAX(sort_order),0) AS v FROM accounts WHERE user_id=?", (uid(),))["v"]
    q("INSERT INTO accounts(user_id,name,balance,currency,icon,color,is_priority,is_reserve,sort_order) VALUES(?,?,?,?,?,?,?,?,?)",
      (uid(), d["name"], d.get("balance", 0), d.get("currency", "RUB"),
       d.get("icon", "💰"), d.get("color", "#6366f1"),
       int(bool(d.get("is_priority"))), int(bool(d.get("is_reserve"))), max_order + 1))
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@accounts_bp.route("/api/accounts/<int:aid>", methods=["PUT", "DELETE"])
def account_item(aid):
    if request.method == "DELETE":
        q("DELETE FROM accounts WHERE id=? AND user_id=?", (aid, uid()))
        commit()
        return jsonify({"ok": True})
    d = request.get_json(force=True)
    if d.get("is_priority"):
        q("UPDATE accounts SET is_priority=0 WHERE user_id=?", (uid(),))
    q("UPDATE accounts SET name=?,balance=?,currency=?,icon=?,color=?,is_priority=?,is_reserve=? WHERE id=? AND user_id=?",
      (d["name"], d.get("balance", 0), d.get("currency", "RUB"),
       d.get("icon", "💰"), d.get("color", "#6366f1"),
       int(bool(d.get("is_priority"))), int(bool(d.get("is_reserve"))), aid, uid()))
    commit()
    return jsonify({"ok": True})


@accounts_bp.route("/api/accounts/<int:aid>/move", methods=["PUT"])
def account_move(aid):
    d   = request.get_json(force=True)
    row = qone("SELECT id, sort_order FROM accounts WHERE id=? AND user_id=?", (aid, uid()))
    if not row:
        return jsonify({"error": "not found"}), 404
    current = row["sort_order"]
    if d.get("direction", "up") == "up":
        other = qone("SELECT id, sort_order FROM accounts WHERE user_id=? AND sort_order<? ORDER BY sort_order DESC LIMIT 1", (uid(), current))
    else:
        other = qone("SELECT id, sort_order FROM accounts WHERE user_id=? AND sort_order>? ORDER BY sort_order ASC LIMIT 1",  (uid(), current))
    if other:
        q("UPDATE accounts SET sort_order=? WHERE id=? AND user_id=?", (other["sort_order"], aid, uid()))
        q("UPDATE accounts SET sort_order=? WHERE id=? AND user_id=?", (current, other["id"], uid()))
        commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Transfers
# ──────────────────────────────────────────────
