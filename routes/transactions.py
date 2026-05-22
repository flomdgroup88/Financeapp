"""
routes/transactions.py — маршруты: Транзакции
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

transactions_bp = Blueprint("transactions", __name__)

@transactions_bp.route("/api/transactions", methods=["GET", "POST"])
def transactions():
    if request.method == "GET":
        clauses = ["t.user_id=?"]
        params  = [uid()]
        for key, col in (("type","t.type"), ("account_id","t.account_id"), ("category_id","t.category_id")):
            if request.args.get(key):
                clauses.append(f"{col}=?"); params.append(request.args[key])
        if request.args.get("goal") == "1":
            clauses.append("t.goal_id IS NOT NULL")
        if request.args.get("start_date"):
            clauses.append("t.date>=?"); params.append(request.args["start_date"])
        if request.args.get("end_date"):
            clauses.append("t.date<=?"); params.append(request.args["end_date"])
        if request.args.get("search"):
            clauses.append("LOWER(t.description) LIKE ?")
            params.append(f"%{request.args['search'].strip().lower()}%")
        where  = "WHERE " + " AND ".join(clauses)
        limit  = max(1, min(int(request.args.get("limit", 50)), 500))   # не больше 500
        offset = max(0, int(request.args.get("offset", 0)))

        # Сортировка — белый список полей, чтобы исключить SQL-инъекцию
        SORT_COLS = {"date": "t.date", "amount": "t.amount", "type": "t.type"}
        sort_by  = SORT_COLS.get(request.args.get("sort_by", "date"), "t.date")
        sort_dir = "ASC" if request.args.get("sort_dir", "desc").lower() == "asc" else "DESC"
        # Вторичный ключ: при сортировке по дате — id убывает (новые сверху при равной дате)
        secondary = "t.id DESC" if sort_by == "t.date" else "t.date DESC, t.id DESC"
        order_clause = f"{sort_by} {sort_dir}, {secondary}"

        rows   = qall(
            f"""SELECT t.*,
                   c.name  AS category_name,
                   c.icon  AS category_icon,
                   c.color AS category_color,
                   a.name  AS account_name
               FROM transactions t
               LEFT JOIN categories c ON c.id=t.category_id
               LEFT JOIN accounts   a ON a.id=t.account_id
               {where}
               ORDER BY {order_clause} LIMIT ? OFFSET ?""",
            params + [limit, offset])

        # Aggregate stats over the full period (no limit/offset, no search filter)
        # Use the same clauses minus the search filter so totals reflect the date/account/type filters
        stat_clauses = [c for c in clauses if "description" not in c]
        stat_params  = [p for c, p in zip(clauses, params) if "description" not in c]
        stat_where   = "WHERE " + " AND ".join(stat_clauses) if stat_clauses else ""
        agg = qone(
            f"""SELECT
                   COALESCE(SUM(CASE WHEN t.type='expense'  THEN t.amount ELSE 0 END), 0) AS total_expense,
                   COALESCE(SUM(CASE WHEN t.type='income'   THEN t.amount ELSE 0 END), 0) AS total_income,
                   COUNT(*) AS total_count
               FROM transactions t
               {stat_where}""",
            stat_params)
        # Top categories (for the full period, expenses only)
        cat_clauses = stat_clauses + ["t.type='expense'", "t.category_id IS NOT NULL"]
        cat_params  = stat_params[:]
        cat_where   = "WHERE " + " AND ".join(cat_clauses)
        top_cats = qall(
            f"""SELECT t.category_id, c.name AS category_name, c.icon AS category_icon,
                       c.color AS category_color, SUM(t.amount) AS total
               FROM transactions t
               LEFT JOIN categories c ON c.id=t.category_id
               {cat_where}
               GROUP BY t.category_id ORDER BY total DESC LIMIT 5""",
            cat_params)

        return jsonify({
            "transactions": rows,
            "limit": limit,
            "offset": offset,
            "stats": {
                "total_expense": agg["total_expense"] if agg else 0,
                "total_income":  agg["total_income"]  if agg else 0,
                "total_count":   agg["total_count"]   if agg else 0,
                "top_categories": [dict(r) for r in top_cats],
            }
        })

    d       = request.get_json(force=True)
    amount  = float(d.get("amount", 0))
    acc_id  = d.get("account_id")
    tx_type = d.get("type", "expense")
    tx_date = d.get("date") or date.today().isoformat()
    cat_id  = d.get("category_id")
    desc    = d.get("description", "")

    if amount <= 0:
        return jsonify({"error": "amount must be > 0"}), 400

    # Лимит задаётся через переменную окружения TX_LIMIT (по умолчанию 100 000).
    # Поставьте TX_LIMIT=0 чтобы убрать лимит совсем.
    import os as _os
    _tx_limit = int(_os.environ.get("TX_LIMIT", 100_000))
    if _tx_limit > 0:
        count = qone("SELECT COUNT(*) AS v FROM transactions WHERE user_id=?", (uid(),))["v"]
        if count >= _tx_limit:
            return jsonify({"error": f"Достигнут лимит: не более {_tx_limit:,} транзакций на пользователя"}), 400

    cur = q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,?,?,?,?,?)",
      (uid(), acc_id, cat_id, amount, tx_type, desc, tx_date))

    new_id = cur.lastrowid

    if acc_id:
        delta = -amount if tx_type == "expense" else amount
        q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?", (delta, acc_id, uid()))

    commit()
    return jsonify({"ok": True, "id": new_id})


@transactions_bp.route("/api/transactions/<int:tid>", methods=["GET", "DELETE", "PUT"])
def transaction_item(tid):
    if request.method == "GET":
        row = qone("""SELECT t.*,
                           c.name  AS category_name,
                           c.icon  AS category_icon,
                           c.color AS category_color,
                           a.name  AS account_name
                       FROM transactions t
                       LEFT JOIN categories c ON c.id=t.category_id
                       LEFT JOIN accounts   a ON a.id=t.account_id
                       WHERE t.id=? AND t.user_id=?""", (tid, uid()))
        if not row:
            return jsonify({"error": "not found"}), 404
        # Fetch paired transaction if exists
        pair = None
        if row["paired_tx_id"]:
            pair = qone("""SELECT t.*, a.name AS account_name
                           FROM transactions t
                           LEFT JOIN accounts a ON a.id=t.account_id
                           WHERE t.id=? AND t.user_id=?""", (row["paired_tx_id"], uid()))
        return jsonify({"transaction": dict(row), "pair": dict(pair) if pair else None})
    if request.method == "DELETE":
        row = qone("SELECT * FROM transactions WHERE id=? AND user_id=?", (tid, uid()))
        if row:
            if row["type"] == "transfer":
                # Reverse balance effects and delete both sides
                if row["account_id"]:
                    q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?",
                      (row["amount"], row["account_id"], uid()))
                if row["paired_tx_id"]:
                    pair = qone("SELECT * FROM transactions WHERE id=? AND user_id=?",
                                (row["paired_tx_id"], uid()))
                    if pair and pair["account_id"]:
                        q("UPDATE accounts SET balance=balance-? WHERE id=? AND user_id=?",
                          (pair["amount"], pair["account_id"], uid()))
                    q("DELETE FROM transactions WHERE id=? AND user_id=?", (row["paired_tx_id"], uid()))
            else:
                if row["account_id"]:
                    delta = row["amount"] if row["type"] == "expense" else -row["amount"]
                    q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?", (delta, row["account_id"], uid()))
            q("DELETE FROM transactions WHERE id=? AND user_id=?", (tid, uid()))
            commit()
        return jsonify({"ok": True})

    # PUT — edit transaction
    old = qone("SELECT * FROM transactions WHERE id=? AND user_id=?", (tid, uid()))
    if not old:
        return jsonify({"error": "not found"}), 404

    d          = request.get_json(force=True)
    new_amount = float(d.get("amount", old["amount"]))
    new_acc_id = d.get("account_id", old["account_id"])
    new_cat_id = d.get("category_id", old["category_id"])
    new_type   = d.get("type", old["type"])
    new_date   = d.get("date", old["date"])
    new_desc   = d.get("description", old["description"] or "")

    # Handle transfer editing — update both paired transactions
    if old["type"] == "transfer":
        pair_id = old["paired_tx_id"]
        pair    = qone("SELECT * FROM transactions WHERE id=? AND user_id=?", (pair_id, uid())) if pair_id else None

        new_to_id   = d.get("to_account_id", pair["account_id"] if pair else None)
        new_from_id = new_acc_id

        cfg      = qone("SELECT value FROM settings WHERE user_id=? AND key='usd_rate'", (uid(),))
        usd_rate = float(cfg["value"]) if cfg else 90

        from_acc = qone("SELECT * FROM accounts WHERE id=? AND user_id=?", (new_from_id, uid()))
        to_acc   = qone("SELECT * FROM accounts WHERE id=? AND user_id=?", (new_to_id,   uid()))

        if from_acc and to_acc:
            if from_acc["currency"] == to_acc["currency"]:
                to_amount = new_amount
            elif from_acc["currency"] == "USD" and to_acc["currency"] == "RUB":
                to_amount = round(new_amount * usd_rate, 2)
            elif from_acc["currency"] == "RUB" and to_acc["currency"] == "USD":
                to_amount = round(new_amount / usd_rate, 2)
            else:
                to_amount = new_amount
        else:
            to_amount = pair["amount"] if pair else new_amount

        # Reverse old balance effects
        if old["account_id"]:
            q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?",
              (old["amount"], old["account_id"], uid()))
        if pair and pair["account_id"]:
            q("UPDATE accounts SET balance=balance-? WHERE id=? AND user_id=?",
              (pair["amount"], pair["account_id"], uid()))

        # Apply new balance effects
        if new_from_id:
            q("UPDATE accounts SET balance=balance-? WHERE id=? AND user_id=?", (new_amount,  new_from_id, uid()))
        if new_to_id:
            q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?", (to_amount,   new_to_id,   uid()))

        label = new_desc or "Перевод"
        to_name   = to_acc["name"]   if to_acc   else "?"
        from_name = from_acc["name"] if from_acc else "?"

        q("""UPDATE transactions SET account_id=?, amount=?, description=?, date=?
             WHERE id=? AND user_id=?""",
          (new_from_id, new_amount,  f"{label} → {to_name}",   new_date, tid,     uid()))
        if pair_id:
            q("""UPDATE transactions SET account_id=?, amount=?, description=?, date=?
                 WHERE id=? AND user_id=?""",
              (new_to_id, to_amount, f"{label} ← {from_name}", new_date, pair_id, uid()))
        commit()
        return jsonify({"ok": True})

    # Reverse old balance effect
    if old["account_id"] and old["type"] in ("expense", "income"):
        delta = old["amount"] if old["type"] == "expense" else -old["amount"]
        q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?",
          (delta, old["account_id"], uid()))

    # Apply new balance effect
    if new_acc_id and new_type in ("expense", "income"):
        delta = -new_amount if new_type == "expense" else new_amount
        q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?",
          (delta, new_acc_id, uid()))

    q("""UPDATE transactions
         SET account_id=?, category_id=?, amount=?, type=?, description=?, date=?
         WHERE id=? AND user_id=?""",
      (new_acc_id, new_cat_id, new_amount, new_type, new_desc, new_date, tid, uid()))

    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Budget Limits
# ──────────────────────────────────────────────
