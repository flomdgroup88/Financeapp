"""
routes/export.py — Экспорт транзакций в CSV и JSON.

Эндпоинты:
  GET /api/export/csv   — скачать все транзакции пользователя как CSV-файл
  GET /api/export/json  — скачать все транзакции пользователя как JSON-файл

Параметры (опционально):
  ?start_date=2025-01-01   — с какой даты
  ?end_date=2025-12-31     — по какую дату
  ?type=expense|income     — только траты или только доходы

Без сторонних библиотек — только стандартный Python csv + json.
"""

import csv
import io
import json
from datetime import date

from flask import Blueprint, Response, jsonify, request

from db import qall, uid

export_bp = Blueprint("export", __name__)


def _get_transactions(user_id: str) -> list[dict]:
    """Возвращает транзакции пользователя с учётом фильтров из query string."""
    clauses = ["t.user_id = ?"]
    params  = [user_id]

    if request.args.get("start_date"):
        clauses.append("t.date >= ?")
        params.append(request.args["start_date"])

    if request.args.get("end_date"):
        clauses.append("t.date <= ?")
        params.append(request.args["end_date"])

    if request.args.get("type") in ("expense", "income", "transfer"):
        clauses.append("t.type = ?")
        params.append(request.args["type"])

    where = "WHERE " + " AND ".join(clauses)

    return qall(
        f"""SELECT
               t.date,
               t.type,
               t.amount,
               t.description,
               c.name  AS category,
               a.name  AS account,
               a.currency,
               t.created_at
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
           LEFT JOIN accounts   a ON a.id = t.account_id
           {where}
           ORDER BY t.date DESC, t.id DESC""",
        params,
    )


# ── CSV ───────────────────────────────────────────────────────────────────────

@export_bp.route("/api/export/csv")
def export_csv():
    """Скачать транзакции как CSV (открывается в Excel, Google Sheets и т.д.)."""
    rows = _get_transactions(uid())

    output = io.StringIO()
    writer = csv.writer(output, delimiter=",", quoting=csv.QUOTE_MINIMAL)

    # Заголовок
    writer.writerow([
        "Дата", "Тип", "Сумма", "Валюта", "Категория", "Счёт", "Описание", "Создано"
    ])

    # Строки
    type_map = {"expense": "Расход", "income": "Доход", "transfer": "Перевод"}
    for r in rows:
        writer.writerow([
            r["date"],
            type_map.get(r["type"], r["type"]),
            r["amount"],
            r.get("currency") or "RUB",
            r.get("category") or "",
            r.get("account")  or "",
            r.get("description") or "",
            r.get("created_at") or "",
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")  # utf-8-sig — Excel открывает без кракозябр

    today = date.today().isoformat()
    filename = f"finance_export_{today}.csv"

    return Response(
        csv_bytes,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── JSON ──────────────────────────────────────────────────────────────────────

@export_bp.route("/api/export/json")
def export_json():
    """Скачать транзакции как JSON — удобно для переноса данных в другие приложения."""
    rows = _get_transactions(uid())

    payload = {
        "exported_at": date.today().isoformat(),
        "count":       len(rows),
        "transactions": rows,
    }

    json_bytes = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")

    today = date.today().isoformat()
    filename = f"finance_export_{today}.json"

    return Response(
        json_bytes,
        mimetype="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
