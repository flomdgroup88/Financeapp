"""
routes/budgets.py — маршруты: Лимиты бюджета
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

budgets_bp = Blueprint("budgets", __name__)

@budgets_bp.route("/api/budget-limits", methods=["GET", "POST"])
def budget_limits():
    if request.method == "GET":
        year  = int(request.args.get("year",  date.today().year))
        month = int(request.args.get("month", date.today().month))
        start = f"{year}-{month:02d}-01"
        end   = f"{year}-{month:02d}-31"
        limits = qall(
            """SELECT bl.id, bl.category_id, bl.amount,
                      c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                      COALESCE(SUM(t.amount), 0) AS spent
               FROM budget_limits bl
               JOIN categories c ON c.id = bl.category_id
               LEFT JOIN transactions t
                  ON t.category_id = bl.category_id
                  AND t.user_id = bl.user_id
                  AND t.type = 'expense'
                  AND t.date >= ? AND t.date <= ?
               WHERE bl.user_id = ?
               GROUP BY bl.id
               ORDER BY c.sort_order, c.id""",
            (start, end, uid()))
        return jsonify({"budget_limits": limits})

    d      = request.get_json(force=True)
    cat_id = d.get("category_id")
    amount = float(d.get("amount", 0))
    if not cat_id:
        return jsonify({"error": "category_id required"}), 400
    if amount <= 0:
        # Delete the limit if amount is 0
        q("DELETE FROM budget_limits WHERE user_id=? AND category_id=?", (uid(), cat_id))
        commit()
        return jsonify({"ok": True, "deleted": True})
    cur = q("INSERT INTO budget_limits(user_id, category_id, amount) VALUES(?,?,?) "
      "ON CONFLICT(user_id, category_id) DO UPDATE SET amount=excluded.amount",
      (uid(), cat_id, amount))
    commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@budgets_bp.route("/api/budget-limits/<int:bid>", methods=["DELETE"])
def budget_limit_item(bid):
    q("DELETE FROM budget_limits WHERE id=? AND user_id=?", (bid, uid()))
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Subscriptions
# ──────────────────────────────────────────────
