"""
routes/stats.py — маршруты: Статистика
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

stats_bp = Blueprint("stats", __name__)

@stats_bp.route("/api/stats/monthly")
def stats_monthly():
    year  = int(request.args.get("year",  date.today().year))
    month = int(request.args.get("month", date.today().month))
    start = f"{year}-{month:02d}-01"
    end   = date(year, month, calendar.monthrange(year, month)[1]).isoformat()

    total_exp = qone(
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE user_id=? AND type='expense' AND date>=? AND date<=?",
        (uid(), start, end))["v"]
    total_inc = qone(
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE user_id=? AND type='income'  AND date>=? AND date<=?",
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

    return jsonify({"total_expenses": total_exp, "total_income": total_inc,
                    "by_category": by_cat, "daily": daily})


# ──────────────────────────────────────────────
# Stats — comparison
# ──────────────────────────────────────────────
@stats_bp.route("/api/stats/comparison")
def stats_comparison():
    today_dt = date.today()
    cy, cm   = today_dt.year, today_dt.month
    py, pm   = (cy - 1, 12) if cm == 1 else (cy, cm - 1)

    def mr(y, m): return f"{y}-{m:02d}-01", date(y, m, calendar.monthrange(y, m)[1]).isoformat()
    cs, ce = mr(cy, cm)
    ps, pe = mr(py, pm)

    curr_total = qone("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE user_id=? AND type='expense' AND date>=? AND date<=?", (uid(), cs, ce))["v"]
    prev_total = qone("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE user_id=? AND type='expense' AND date>=? AND date<=?", (uid(), ps, pe))["v"]

    def cats_by_period(s, e):
        return {r["id"]: r for r in qall(
            """SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(t.amount),0) AS total
               FROM categories c JOIN transactions t ON t.category_id=c.id
               WHERE t.user_id=? AND t.type='expense' AND t.date>=? AND t.date<=?
               GROUP BY c.id""", (uid(), s, e))}

    curr_cats  = cats_by_period(cs, ce)
    prev_cats  = cats_by_period(ps, pe)
    all_ids    = set(curr_cats) | set(prev_cats)
    comparison = []
    for cid in all_ids:
        c      = curr_cats.get(cid) or prev_cats.get(cid)
        curr_a = curr_cats.get(cid, {}).get("total", 0)
        prev_a = prev_cats.get(cid, {}).get("total", 0)
        pct    = round((curr_a - prev_a) / prev_a * 100) if prev_a > 0 else (100 if curr_a > 0 else 0)
        comparison.append({"id": cid, "name": c["name"], "icon": c["icon"], "color": c["color"],
                           "curr_amount": curr_a, "prev_amount": prev_a, "change_pct": pct})
    comparison.sort(key=lambda x: -x["curr_amount"])
    change_pct = round((curr_total - prev_total) / prev_total * 100) if prev_total > 0 else 0

    return jsonify({"current": {"total": curr_total}, "previous": {"total": prev_total},
                    "change_pct": change_pct, "comparison": comparison})


# ──────────────────────────────────────────────
# Stats — yearly
# ──────────────────────────────────────────────
@stats_bp.route("/api/stats/yearly")
def stats_yearly():
    year = int(request.args.get("year", date.today().year))
    start = f"{year}-01-01"
    end   = f"{year}-12-31"

    # Total income and expenses for the year
    total_exp = qone(
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE user_id=? AND type='expense' AND date>=? AND date<=?",
        (uid(), start, end))["v"]
    total_inc = qone(
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE user_id=? AND type='income' AND date>=? AND date<=?",
        (uid(), start, end))["v"]

    # Monthly breakdown — один запрос вместо 24 (12 месяцев × 2 типа)
    rows = qall(
        """SELECT CAST(strftime('%m', date) AS INTEGER) AS month,
                  type,
                  COALESCE(SUM(amount), 0) AS total
           FROM transactions
           WHERE user_id=? AND date>=? AND date<=?
             AND type IN ('expense','income')
           GROUP BY month, type""",
        (uid(), start, end))
    month_map = {m: {"month": m, "expenses": 0.0, "income": 0.0} for m in range(1, 13)}
    for r in rows:
        key = "expenses" if r["type"] == "expense" else "income"
        month_map[r["month"]][key] = r["total"]
    monthly = [month_map[m] for m in range(1, 13)]

    # Top categories for the year
    by_cat = qall(
        """SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(t.amount),0) AS total
           FROM categories c
           JOIN transactions t ON t.category_id=c.id
           WHERE t.user_id=? AND t.type='expense' AND t.date>=? AND t.date<=?
           GROUP BY c.id ORDER BY total DESC LIMIT 10""",
        (uid(), start, end))

    # Count of transactions
    tx_count = qone(
        "SELECT COUNT(*) AS v FROM transactions WHERE user_id=? AND date>=? AND date<=?",
        (uid(), start, end))["v"]

    # Best saving month (highest income - expense)
    best_month = max(monthly, key=lambda x: x["income"] - x["expenses"], default=None)
    worst_month = max(monthly, key=lambda x: x["expenses"], default=None)

    # Average monthly spending (only months with data)
    active_months = [m for m in monthly if m["expenses"] > 0]
    avg_monthly = (total_exp / len(active_months)) if active_months else 0

    return jsonify({
        "year": year,
        "total_expenses": total_exp,
        "total_income": total_inc,
        "monthly": monthly,
        "by_category": by_cat,
        "tx_count": tx_count,
        "best_month": best_month,
        "worst_month": worst_month,
        "avg_monthly_expense": avg_monthly,
        "active_months": len(active_months),
    })


# ──────────────────────────────────────────────
# Savings Goals
# ──────────────────────────────────────────────
