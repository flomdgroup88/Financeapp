"""
routes/recurring.py — маршруты: Повторяющиеся
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH
from db import calc_next_date_from_billing_day

recurring_bp = Blueprint("recurring", __name__)

def calc_next_recurring_date(period, day_of_month=None, base_date=None):
    today_dt = base_date or date.today()
    if period == "daily":
        return (today_dt + timedelta(days=1)).isoformat()
    if period == "weekly":
        return (today_dt + timedelta(days=7)).isoformat()
    if period == "monthly":
        bd = int(day_of_month or today_dt.day)
        return calc_next_date_from_billing_day(bd, today_dt)
    if period == "yearly":
        try:
            return today_dt.replace(year=today_dt.year + 1).isoformat()
        except ValueError:
            return today_dt.replace(year=today_dt.year + 1, day=28).isoformat()
    return (today_dt + timedelta(days=30)).isoformat()


@recurring_bp.route("/api/recurring", methods=["GET", "POST"])
def recurring():
    if request.method == "GET":
        rows = qall("""SELECT r.*,
                          c.name AS category_name, c.icon AS category_icon,
                          a.name AS account_name
                      FROM recurring_transactions r
                      LEFT JOIN categories c ON c.id=r.category_id
                      LEFT JOIN accounts   a ON a.id=r.account_id
                      WHERE r.user_id=? ORDER BY r.is_active DESC, r.next_date""", (uid(),))
        return jsonify({"recurring": rows})
    d = request.get_json(force=True)
    amount = float(d.get("amount", 0))
    if amount <= 0:
        return jsonify({"error": "amount > 0 required"}), 400
    count = qone("SELECT COUNT(*) AS v FROM recurring_transactions WHERE user_id=?", (uid(),))["v"]
    if count >= 50:
        return jsonify({"error": "Достигнут лимит: не более 50 регулярных платежей"}), 400
    period       = d.get("period", "monthly")
    day_of_month = int(d.get("day_of_month") or 1) if period == "monthly" else None
    next_date    = calc_next_recurring_date(period, day_of_month)
    cur = q("INSERT INTO recurring_transactions(user_id,name,amount,type,category_id,account_id,period,day_of_month,next_date,description,icon,color) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      (uid(), d["name"], amount, d.get("type", "expense"),
       d.get("category_id") or None, d.get("account_id") or None,
       period, day_of_month, next_date,
       d.get("description", ""), d.get("icon", "🔄"), d.get("color", "#6366f1")))
    commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@recurring_bp.route("/api/recurring/<int:rid>", methods=["PUT", "DELETE"])
def recurring_item(rid):
    if request.method == "DELETE":
        q("DELETE FROM recurring_transactions WHERE id=? AND user_id=?", (rid, uid()))
        commit()
        return jsonify({"ok": True})
    d = request.get_json(force=True)
    period       = d.get("period", "monthly")
    day_of_month = int(d.get("day_of_month") or 1) if period == "monthly" else None
    next_date    = calc_next_recurring_date(period, day_of_month)
    q("UPDATE recurring_transactions SET name=?,amount=?,type=?,category_id=?,account_id=?,period=?,day_of_month=?,next_date=?,description=?,icon=?,color=? WHERE id=? AND user_id=?",
      (d["name"], float(d.get("amount", 0)), d.get("type", "expense"),
       d.get("category_id") or None, d.get("account_id") or None,
       period, day_of_month, next_date,
       d.get("description", ""), d.get("icon", "🔄"), d.get("color", "#6366f1"), rid, uid()))
    commit()
    return jsonify({"ok": True})


@recurring_bp.route("/api/recurring/<int:rid>/toggle", methods=["PUT"])
def recurring_toggle(rid):
    q("UPDATE recurring_transactions SET is_active=1-is_active WHERE id=? AND user_id=?", (rid, uid()))
    commit()
    return jsonify({"ok": True})


@recurring_bp.route("/api/recurring/<int:rid>/apply", methods=["POST"])
def recurring_apply(rid):
    rec = qone("SELECT * FROM recurring_transactions WHERE id=? AND user_id=?", (rid, uid()))
    if not rec:
        return jsonify({"error": "not found"}), 404
    acc_id = rec.get("account_id")
    if not acc_id:
        prio = qone("SELECT id FROM accounts WHERE user_id=? AND is_priority=1 AND is_reserve=0 LIMIT 1", (uid(),))
        if prio:
            acc_id = prio["id"]
    tx_date = date.today().isoformat()
    amount  = rec["amount"]
    q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,?,?,?,?,?)",
      (uid(), acc_id, rec.get("category_id"), amount, rec["type"], rec["name"], tx_date))
    if acc_id:
        delta = -amount if rec["type"] == "expense" else amount
        q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?", (delta, acc_id, uid()))
    next_date = calc_next_recurring_date(rec["period"], rec.get("day_of_month"))
    q("UPDATE recurring_transactions SET next_date=? WHERE id=? AND user_id=?", (next_date, rid, uid()))
    commit()
    return jsonify({"ok": True, "next_date": next_date, "account_id": acc_id})


# ──────────────────────────────────────────────
# ──────────────────────────────────────────────
# Local auth helpers
# ──────────────────────────────────────────────
