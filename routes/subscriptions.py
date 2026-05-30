"""
routes/subscriptions.py — маршруты: Подписки
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH
from db import calc_next_date_from_billing_day

subscriptions_bp = Blueprint("subscriptions", __name__)


def _advance_sub_date(d, period, billing_day=None):
    """Следующая дата списания после d."""
    if period == "monthly":
        bd = int(billing_day or d.day)
        nm = d.month + 1 if d.month < 12 else 1
        ny = d.year if d.month < 12 else d.year + 1
        return date(ny, nm, min(bd, calendar.monthrange(ny, nm)[1]))
    # yearly
    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        return d.replace(year=d.year + 1, day=28)


def process_due_auto_charges(user_id):
    """Догоняет автосписания при открытии приложения.

    Для каждой активной авто-подписки, у которой next_date уже наступила,
    создаёт расход(ы) на фактическую дату списания, уменьшает баланс счёта
    и двигает next_date вперёд — пока дата не станет будущей.
    Вызывается из /api/bootstrap. Возвращает количество созданных списаний.
    """
    today = date.today()
    subs = qall(
        "SELECT * FROM subscriptions "
        "WHERE user_id=? AND is_active=1 AND auto_charge=1 "
        "AND next_date IS NOT NULL AND next_date<=?",
        (user_id, today.isoformat()))
    charged = 0
    for sub in subs:
        acc_id = sub.get("account_id")
        if not acc_id:
            prio = qone("SELECT id FROM accounts WHERE user_id=? AND is_priority=1 AND is_reserve=0 LIMIT 1", (user_id,))
            acc_id = prio["id"] if prio else None
        if not acc_id:
            continue  # некуда списывать — дату не двигаем, попробуем в следующий раз
        try:
            nd = date.fromisoformat(sub["next_date"])
        except (ValueError, TypeError):
            continue
        amount = sub["amount"]
        guard  = 0
        while nd <= today and guard < 36:  # максимум 3 года догона — защита от зацикливания
            guard += 1
            q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,NULL,?,?,?,?)",
              (user_id, acc_id, amount, "expense", f"Подписка: {sub['name']}", nd.isoformat()))
            q("UPDATE accounts SET balance=balance-? WHERE id=? AND user_id=?", (amount, acc_id, user_id))
            charged += 1
            nd = _advance_sub_date(nd, sub["period"], sub.get("billing_day"))
        q("UPDATE subscriptions SET next_date=? WHERE id=? AND user_id=?", (nd.isoformat(), sub["id"], user_id))
    if charged:
        commit()
    return charged


@subscriptions_bp.route("/api/subscriptions", methods=["GET", "POST"])
def subscriptions():
    if request.method == "GET":
        return jsonify({"subscriptions": qall(
            "SELECT * FROM subscriptions WHERE user_id=? ORDER BY is_active DESC, next_date", (uid(),))})
    d           = request.get_json(force=True)
    count = qone("SELECT COUNT(*) AS v FROM subscriptions WHERE user_id=?", (uid(),))["v"]
    if count >= 50:
        return jsonify({"error": "Достигнут лимит: не более 50 подписок"}), 400
    period      = d.get("period", "monthly")
    billing_day = d.get("billing_day")
    next_date   = d.get("next_date")
    if period == "monthly" and billing_day:
        next_date = calc_next_date_from_billing_day(billing_day)
    elif period == "yearly" and not next_date:
        next_date = (date.today() + timedelta(days=365)).isoformat()
    auto_charge = 1 if d.get("auto_charge") else 0
    cur = q("INSERT INTO subscriptions(user_id,name,amount,currency,period,next_date,billing_day,account_id,description,icon,color,auto_charge) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      (uid(), d["name"], float(d.get("amount", 0)), d.get("currency", "RUB"),
       period, next_date, billing_day,
       d.get("account_id"), d.get("description", ""),
       d.get("icon", "🔔"), d.get("color", "#6366f1"), auto_charge))
    commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@subscriptions_bp.route("/api/subscriptions/<int:sid>", methods=["PUT", "DELETE"])
def subscription_item(sid):
    if request.method == "DELETE":
        q("DELETE FROM subscriptions WHERE id=? AND user_id=?", (sid, uid()))
        commit()
        return jsonify({"ok": True})
    d           = request.get_json(force=True)
    period      = d.get("period", "monthly")
    billing_day = d.get("billing_day")
    next_date   = d.get("next_date")
    if period == "monthly" and billing_day:
        next_date = calc_next_date_from_billing_day(billing_day)
    elif period == "yearly" and not next_date:
        next_date = (date.today() + timedelta(days=365)).isoformat()
    auto_charge = 1 if d.get("auto_charge") else 0
    q("UPDATE subscriptions SET name=?,amount=?,currency=?,period=?,next_date=?,billing_day=?,account_id=?,description=?,icon=?,color=?,auto_charge=? WHERE id=? AND user_id=?",
      (d["name"], float(d.get("amount", 0)), d.get("currency", "RUB"),
       period, next_date, billing_day,
       d.get("account_id"), d.get("description", ""),
       d.get("icon", "🔔"), d.get("color", "#6366f1"), auto_charge, sid, uid()))
    commit()
    return jsonify({"ok": True})


@subscriptions_bp.route("/api/subscriptions/<int:sid>/toggle", methods=["PUT"])
def subscription_toggle(sid):
    q("UPDATE subscriptions SET is_active=1-is_active WHERE id=? AND user_id=?", (sid, uid()))
    commit()
    return jsonify({"ok": True})


@subscriptions_bp.route("/api/subscriptions/<int:sid>/charge", methods=["POST"])
def subscription_charge(sid):
    sub = qone("SELECT * FROM subscriptions WHERE id=? AND user_id=?", (sid, uid()))
    if not sub:
        return jsonify({"error": "not found"}), 404

    d      = request.get_json(force=True) if (request.content_length or 0) > 0 else {}
    acc_id = d.get("account_id") or sub.get("account_id")

    if not acc_id:
        prio = qone("SELECT id FROM accounts WHERE user_id=? AND is_priority=1 AND is_reserve=0 LIMIT 1", (uid(),))
        if prio:
            acc_id = prio["id"]
    if not acc_id:
        return jsonify({"error": "no account available"}), 400

    amount  = sub["amount"]
    tx_date = date.today().isoformat()

    q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,NULL,?,?,?,?)",
      (uid(), acc_id, amount, "expense", f"Подписка: {sub['name']}", tx_date))
    q("UPDATE accounts SET balance=balance-? WHERE id=? AND user_id=?", (amount, acc_id, uid()))

    if sub["period"] == "monthly":
        billing_day = sub.get("billing_day") or 1
        today_dt = date.today()
        nm = today_dt.month + 1 if today_dt.month < 12 else 1
        ny = today_dt.year if today_dt.month < 12 else today_dt.year + 1
        next_date = date(ny, nm, min(billing_day, calendar.monthrange(ny, nm)[1])).isoformat()
    else:
        if sub["next_date"]:
            nd = date.fromisoformat(sub["next_date"])
            try:    next_date = nd.replace(year=nd.year + 1).isoformat()
            except: next_date = nd.replace(year=nd.year + 1, day=28).isoformat()
        else:
            next_date = (date.today() + timedelta(days=365)).isoformat()

    q("UPDATE subscriptions SET next_date=? WHERE id=? AND user_id=?", (next_date, sid, uid()))
    commit()
    return jsonify({"ok": True, "next_date": next_date, "account_id": acc_id})
