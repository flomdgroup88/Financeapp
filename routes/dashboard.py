"""
routes/dashboard.py — единый эндпоинт для дашборда.

GET /api/dashboard?year=YYYY&month=MM

Объединяет три запроса, которые раньше делались параллельно:
  - /api/stats/monthly
  - /api/stats/comparison
  - /api/budget-limits
"""
from datetime import date
import calendar

from flask import Blueprint, jsonify, request

from db import qone, qall, uid

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/api/dashboard")
def dashboard():
    today = date.today()
    year  = int(request.args.get("year",  today.year))
    month = int(request.args.get("month", today.month))

    # ── 1. Статистика за выбранный месяц ─────────────────────────────
    start = f"{year}-{month:02d}-01"
    end   = date(year, month, calendar.monthrange(year, month)[1]).isoformat()

    total_exp = qone(
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions "
        "WHERE user_id=? AND type='expense' AND date>=? AND date<=?",
        (uid(), start, end))["v"]

    total_inc = qone(
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions "
        "WHERE user_id=? AND type='income' AND date>=? AND date<=?",
        (uid(), start, end))["v"]

    by_cat = qall(
        """SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(t.amount),0) AS total
           FROM categories c
           JOIN transactions t ON t.category_id=c.id
           WHERE t.user_id=? AND t.type='expense' AND t.date>=? AND t.date<=?
           GROUP BY c.id ORDER BY total DESC""",
        (uid(), start, end))

    daily = qall(
        """SELECT date, COALESCE(SUM(amount),0) AS total
           FROM transactions
           WHERE user_id=? AND type='expense' AND date>=? AND date<=?
           GROUP BY date ORDER BY date""",
        (uid(), start, end))

    # ── 2. Сравнение с прошлым месяцем ───────────────────────────────
    cy, cm = today.year, today.month
    py, pm = (cy - 1, 12) if cm == 1 else (cy, cm - 1)

    def month_range(y, m):
        return f"{y}-{m:02d}-01", date(y, m, calendar.monthrange(y, m)[1]).isoformat()

    cs, ce = month_range(cy, cm)
    ps, pe = month_range(py, pm)

    curr_total = qone(
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions "
        "WHERE user_id=? AND type='expense' AND date>=? AND date<=?",
        (uid(), cs, ce))["v"]

    prev_total = qone(
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions "
        "WHERE user_id=? AND type='expense' AND date>=? AND date<=?",
        (uid(), ps, pe))["v"]

    def cats_by_period(s, e):
        return {r["id"]: r for r in qall(
            """SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(t.amount),0) AS total
               FROM categories c JOIN transactions t ON t.category_id=c.id
               WHERE t.user_id=? AND t.type='expense' AND t.date>=? AND t.date<=?
               GROUP BY c.id""",
            (uid(), s, e))}

    curr_cats  = cats_by_period(cs, ce)
    prev_cats  = cats_by_period(ps, pe)
    all_ids    = set(curr_cats) | set(prev_cats)
    comparison = []
    for cid in all_ids:
        c      = curr_cats.get(cid) or prev_cats.get(cid)
        curr_a = curr_cats.get(cid, {}).get("total", 0)
        prev_a = prev_cats.get(cid, {}).get("total", 0)
        pct    = round((curr_a - prev_a) / prev_a * 100) if prev_a > 0 else (100 if curr_a > 0 else 0)
        comparison.append({
            "id": cid, "name": c["name"], "icon": c["icon"], "color": c["color"],
            "curr_amount": curr_a, "prev_amount": prev_a, "change_pct": pct,
        })
    comparison.sort(key=lambda x: -x["curr_amount"])
    change_pct = round((curr_total - prev_total) / prev_total * 100) if prev_total > 0 else 0

    # ── 3. Лимиты бюджета за выбранный месяц ─────────────────────────
    budget_limits = qall(
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

    # ── Ответ ─────────────────────────────────────────────────────────
    return jsonify({
        "stats": {
            "total_expenses": total_exp,
            "total_income":   total_inc,
            "by_category":    by_cat,
            "daily":          daily,
        },
        "comparison": {
            "current":    {"total": curr_total},
            "previous":   {"total": prev_total},
            "change_pct": change_pct,
            "comparison": comparison,
        },
        "budget_limits": budget_limits,
    })
