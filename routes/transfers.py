"""
routes/transfers.py — маршруты: Переводы
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

transfers_bp = Blueprint("transfers", __name__)

@transfers_bp.route("/api/transfers", methods=["POST"])
def transfers():
    d       = request.get_json(force=True)
    from_id = d.get("from_id")
    to_id   = d.get("to_id")
    amount  = float(d.get("amount", 0))
    desc    = d.get("description", "")
    tx_date = d.get("date") or date.today().isoformat()

    if amount <= 0:
        return jsonify({"error": "amount must be > 0"}), 400
    if not from_id or not to_id or int(from_id) == int(to_id):
        return jsonify({"error": "invalid accounts"}), 400

    from_acc = qone("SELECT * FROM accounts WHERE id=? AND user_id=?", (from_id, uid()))
    to_acc   = qone("SELECT * FROM accounts WHERE id=? AND user_id=?", (to_id,   uid()))
    if not from_acc or not to_acc:
        return jsonify({"error": "account not found"}), 404

    cfg      = qone("SELECT value FROM settings WHERE user_id=? AND key='usd_rate'", (uid(),))
    usd_rate = float(cfg["value"]) if cfg else 90

    if from_acc["currency"] == to_acc["currency"]:
        to_amount = amount
    elif from_acc["currency"] == "USD" and to_acc["currency"] == "RUB":
        to_amount = round(amount * usd_rate, 2)
    elif from_acc["currency"] == "RUB" and to_acc["currency"] == "USD":
        to_amount = round(amount / usd_rate, 2)
    else:
        to_amount = amount

    q("UPDATE accounts SET balance=balance-? WHERE id=? AND user_id=?", (amount,    from_id, uid()))
    q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?", (to_amount, to_id,   uid()))

    label = desc or "Перевод"
    cur1 = q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,NULL,?,?,?,?)",
      (uid(), from_id, amount,    "transfer", f"{label} → {to_acc['name']}", tx_date))
    from_tx_id = cur1.lastrowid
    cur2 = q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,NULL,?,?,?,?)",
      (uid(), to_id,   to_amount, "transfer", f"{label} ← {from_acc['name']}", tx_date))
    to_tx_id = cur2.lastrowid
    # Link the pair
    q("UPDATE transactions SET paired_tx_id=? WHERE id=?", (to_tx_id,   from_tx_id))
    q("UPDATE transactions SET paired_tx_id=? WHERE id=?", (from_tx_id, to_tx_id))

    commit()
    return jsonify({"ok": True, "to_amount": to_amount})


# ──────────────────────────────────────────────
# Categories
# ──────────────────────────────────────────────
