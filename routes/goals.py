"""
routes/goals.py — маршруты: Цели
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

goals_bp = Blueprint("goals", __name__)

@goals_bp.route("/api/goals", methods=["GET", "POST"])
def goals():
    if request.method == "GET":
        return jsonify({"goals": qall(
            "SELECT * FROM savings_goals WHERE user_id=? ORDER BY created_at", (uid(),))})
    d = request.get_json(force=True)
    count = qone("SELECT COUNT(*) AS v FROM savings_goals WHERE user_id=?", (uid(),))["v"]
    if count >= 20:
        return jsonify({"error": "Достигнут лимит: не более 20 целей"}), 400
    target = float(d.get("target_amount", 0))
    if target <= 0:
        return jsonify({"error": "target_amount must be > 0"}), 400
    cur = q("INSERT INTO savings_goals(user_id,name,target_amount,saved_amount,icon,color,description,deadline) VALUES(?,?,?,?,?,?,?,?)",
      (uid(), d["name"], target, float(d.get("saved_amount", 0)),
       d.get("icon", "🎯"), d.get("color", "#6366f1"),
       d.get("description", ""), d.get("deadline")))
    commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@goals_bp.route("/api/goals/<int:gid>", methods=["PUT", "DELETE"])
def goal_item(gid):
    if request.method == "DELETE":
        q("DELETE FROM savings_goals WHERE id=? AND user_id=?", (gid, uid()))
        commit()
        return jsonify({"ok": True})
    d = request.get_json(force=True)
    q("UPDATE savings_goals SET name=?,target_amount=?,saved_amount=?,icon=?,color=?,description=?,deadline=? WHERE id=? AND user_id=?",
      (d["name"], float(d.get("target_amount", 0)), float(d.get("saved_amount", 0)),
       d.get("icon", "🎯"), d.get("color", "#6366f1"),
       d.get("description", ""), d.get("deadline"), gid, uid()))
    commit()
    return jsonify({"ok": True})


@goals_bp.route("/api/goals/<int:gid>/deposit", methods=["POST"])
def goal_deposit(gid):
    goal = qone("SELECT * FROM savings_goals WHERE id=? AND user_id=?", (gid, uid()))
    if not goal:
        return jsonify({"error": "not found"}), 404
    d      = request.get_json(force=True)
    amount = float(d.get("amount", 0))
    if amount <= 0:
        return jsonify({"error": "amount must be > 0"}), 400
    acc_id  = d.get("account_id")
    tx_date = date.today().isoformat()
    new_saved = goal["saved_amount"] + amount
    q("UPDATE savings_goals SET saved_amount=? WHERE id=? AND user_id=?", (new_saved, gid, uid()))
    if acc_id:
        q("UPDATE accounts SET balance=balance-? WHERE id=? AND user_id=?", (amount, acc_id, uid()))
        q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date,goal_id) VALUES(?,?,NULL,?,?,?,?,?)",
          (uid(), acc_id, amount, "expense", f"Цель: {goal['name']}", tx_date, gid))
    commit()
    return jsonify({"ok": True, "saved_amount": new_saved})


# ──────────────────────────────────────────────
# Recurring Transactions
# ──────────────────────────────────────────────
