"""
routes/backup.py — маршруты: Бэкап
"""
import json

from flask import Blueprint, jsonify, request, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH
import backup as bkp

backup_bp = Blueprint("backup", __name__)


@backup_bp.route("/api/backup/list")
def api_backup_list():
    """GET /api/backup/list — список всех резервных копий."""
    return jsonify({"backups": bkp.list_backups()})


@backup_bp.route("/api/backup/create", methods=["POST"])
def api_backup_create():
    """POST /api/backup/create — создать обе копии (DB + JSON) прямо сейчас."""
    result = bkp.make_backup(label="manual")
    return jsonify(result), (200 if result["ok"] else 500)


@backup_bp.route("/api/backup/download/<filename>")
def api_backup_download(filename: str):
    """GET /api/backup/download/<filename> — скачать конкретную копию."""
    path = bkp.get_backup_path(filename)
    if path is None:
        return jsonify({"error": "Файл не найден"}), 404

    mimetype = "application/json" if filename.endswith(".json") else "application/octet-stream"
    return send_file(
        str(path),
        as_attachment=True,
        download_name=filename,
        mimetype=mimetype,
    )


@backup_bp.route("/api/backup/restore", methods=["POST"])
def api_backup_restore():
    """
    POST /api/backup/restore — восстановить данные из JSON-бэкапа.

    Принимает:
      • Загруженный файл (multipart/form-data, поле "file")
      • Или JSON-тело с ключом "data" (содержимое бэкапа)

    Восстанавливает только данные текущего пользователя.
    Существующие данные УДАЛЯЮТСЯ перед восстановлением.

    Таблицы для восстановления (settings, accounts, categories,
    transactions, subscriptions, planned_income, budget_limits,
    savings_goals, recurring_transactions).
    """
    try:
        # ── Получить данные бэкапа ────────────────────────────────
        if request.files.get("file"):
            raw = request.files["file"].read().decode("utf-8")
            backup_data = json.loads(raw)
        else:
            body = request.get_json(force=True) or {}
            backup_data = body.get("data") or body

        tables = backup_data.get("tables")
        if not tables:
            return jsonify({"error": "Неверный формат бэкапа — нет ключа 'tables'"}), 400

        user = uid()

        # ── Порядок удаления учитывает FK ─────────────────────────
        WIPE_ORDER = [
            "budget_limits", "recurring_transactions", "savings_goals",
            "planned_income", "subscriptions", "transactions",
            "categories", "accounts", "settings",
        ]
        for tbl in WIPE_ORDER:
            try:
                q(f"DELETE FROM {tbl} WHERE user_id=?", (user,))
            except Exception:
                pass

        # ── Восстановление таблиц ─────────────────────────────────
        RESTORE_TABLES = [
            "settings", "accounts", "categories", "transactions",
            "subscriptions", "planned_income", "budget_limits",
            "savings_goals", "recurring_transactions",
        ]

        restored = {}
        for tbl in RESTORE_TABLES:
            rows = tables.get(tbl, [])
            if not rows:
                restored[tbl] = 0
                continue

            # Берём колонки из первой строки
            cols = [c for c in rows[0].keys() if c != "id"]
            if "user_id" not in cols:
                cols.append("user_id")

            placeholders = ", ".join("?" * len(cols))
            col_str      = ", ".join(cols)

            count = 0
            for row in rows:
                vals = []
                for c in cols:
                    vals.append(user if c == "user_id" else row.get(c))
                try:
                    q(f"INSERT INTO {tbl} ({col_str}) VALUES ({placeholders})", vals)
                    count += 1
                except Exception:
                    pass
            restored[tbl] = count

        commit()
        return jsonify({"ok": True, "restored": restored})

    except json.JSONDecodeError:
        return jsonify({"error": "Не удалось разобрать JSON-файл"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
