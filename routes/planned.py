"""
routes/planned.py — маршруты: Плановые доходы
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

planned_bp = Blueprint("planned", __name__)



# ──────────────────────────────────────────────
# Planned income
# ──────────────────────────────────────────────
@planned_bp.route("/api/planned-income", methods=["GET", "POST"])
def planned_income():
    if request.method == "GET":
        return jsonify({"planned_income": qall(
            "SELECT * FROM planned_income WHERE user_id=? ORDER BY expected_date, id", (uid(),))})
    d = request.get_json(force=True)
    cur = q("INSERT INTO planned_income(user_id,amount,description,expected_date) VALUES(?,?,?,?)",
      (uid(), float(d.get("amount", 0)), d.get("description", ""), d.get("expected_date")))
    commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@planned_bp.route("/api/planned-income/<int:pid>/receive", methods=["PUT"])
def planned_receive(pid):
    row = qone("SELECT * FROM planned_income WHERE id=? AND user_id=?", (pid, uid()))
    if not row:
        return jsonify({"error": "not found"}), 404
    acc_id  = request.args.get("account_id", type=int)
    tx_date = date.today().isoformat()
    q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,NULL,?,?,?,?)",
      (uid(), acc_id, row["amount"], "income", row["description"] or "Поступление", tx_date))
    if acc_id:
        q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?", (row["amount"], acc_id, uid()))
    q("DELETE FROM planned_income WHERE id=? AND user_id=?", (pid, uid()))
    commit()
    return jsonify({"ok": True})


@planned_bp.route("/api/planned-income/<int:pid>", methods=["DELETE"])
def planned_item(pid):
    q("DELETE FROM planned_income WHERE id=? AND user_id=?", (pid, uid()))
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Stats — monthly
# ──────────────────────────────────────────────
