"""
routes/dashboard.py — единый эндпоинт для дашборда.

GET /api/dashboard?year=YYYY&month=MM

Было: 9 отдельных запросов к БД.
Стало: 6 запросов — объединены через GROUP BY:
  - Запрос 1: total_expenses + total_income одним SELECT GROUP BY type
  - Запрос 2: by_category (расходы по категориям за выбранный месяц)
  - Запрос 3: daily (расходы по дням за выбранный месяц)
  - Запрос 4: curr_total + prev_total одним SELECT GROUP BY month
  - Запрос 5: curr_cats + prev_cats одним SELECT GROUP BY month, category
  - Запрос 6: budget_limits со spent
"""
from datetime import date
import calendar

from flask import Blueprint, jsonify, request

from db import qall, uid

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/api/dashboard")
def dashboard():
    today = date.today()
    year  = int(request.args.get("year",  today.year))
    month = int(request.args.get("month", today.month))

    def month_range(y, m):
        return f"{y}-{m:02d}-01", date(y, m, calendar.monthrange(y, m)[1]).isoformat()

    start, end = month_range(year, month)

    cy, cm = today.year, today.month
    py, pm = (cy - 1, 12) if cm == 1 else (cy, cm - 1)
    cs, ce = month_range(cy, cm)
    ps, pe = month_range(py, pm)

    # ── Запрос 1: расходы + доходы за выбранный месяц (было 2 запроса) ──
    totals_rows = qall(
        """SELECT type, COALESCE(SUM(amount), 0) AS v
           FROM transactions
           WHERE user_id=? AND type IN ('expense','income') AND date>=? AND date<=?
           GROUP BY type""",
        (uid(), start, end))
    totals      = {r["type"]: r["v"] for r in totals_rows}
    total_exp   = totals.get("expense", 0)
    total_inc   = totals.get("income",  0)

    # ── Запрос 2: расходы по категориям за выбранный месяц ───────────
    by_cat = qall(
        """SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(t.amount),0) AS total
           FROM categories c
           JOIN transactions t ON t.category_id=c.id
           WHERE t.user_id=? AND t.type='expense' AND t.date>=? AND t.date<=?
           GROUP BY c.id ORDER BY total DESC""",
        (uid(), start, end))

    # ── Запрос 3: расходы по дням за выбранный месяц ─────────────────
    daily = qall(
        """SELECT date, COALESCE(SUM(amount),0) AS total
           FROM transactions
           WHERE user_id=? AND type='expense' AND date>=? AND date<=?
           GROUP BY date ORDER BY date""",
        (uid(), start, end))

    # ── Запрос 4: итоги текущего и прошлого месяца (было 2 запроса) ──
    monthly_totals = qall(
        """SELECT strftime('%Y-%m', date) AS month, COALESCE(SUM(amount), 0) AS v
           FROM transactions
           WHERE user_id=? AND type='expense' AND date>=? AND date<=?
           GROUP BY month""",
        (uid(), ps, ce))
    monthly_map = {r["month"]: r["v"] for r in monthly_totals}
    curr_total  = monthly_map.get(f"{cy}-{cm:02d}", 0)
    prev_total  = monthly_map.get(f"{py}-{pm:02d}", 0)

    # ── Запрос 5: категории за оба месяца одним запросом (было 2) ────
    both_cats_rows = qall(
        """SELECT strftime('%Y-%m', t.date) AS month,
                  c.id, c.name, c.icon, c.color,
                  COALESCE(SUM(t.amount), 0) AS total
           FROM categories c
           JOIN transactions t ON t.category_id=c.id
           WHERE t.user_id=? AND t.type='expense' AND t.date>=? AND t.date<=?
           GROUP BY month, c.id""",
        (uid(), ps, ce))

    curr_key = f"{cy}-{cm:02d}"
    prev_key = f"{py}-{pm:02d}"
    curr_cats: dict = {}
    prev_cats: dict = {}
    for r in both_cats_rows:
        entry = {"id": r["id"], "name": r["name"], "icon": r["icon"],
                 "color": r["color"], "total": r["total"]}
        if r["month"] == curr_key:
            curr_cats[r["id"]] = entry
        elif r["month"] == prev_key:
            prev_cats[r["id"]] = entry

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

    # ── Запрос 6: лимиты бюджета со spent за выбранный месяц ─────────
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
