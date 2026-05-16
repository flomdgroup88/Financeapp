"""
Finance Telegram Mini App — Flask backend v3
Запуск: python app.py

Структура проекта:
  app.py          — точка входа, регистрация Blueprint-ов
  db.py           — соединение с БД, схема, хелперы, дефолтные данные
  auth.py         — Telegram HMAC, сессии, локальный вход
  backup.py       — резервное копирование
  routes/
    static_files.py  — HTML, CSS, JS, иконки
    settings.py      — /api/settings
    accounts.py      — /api/accounts
    transfers.py     — /api/transfers
    categories.py    — /api/categories
    transactions.py  — /api/transactions
    budgets.py       — /api/budget-limits
    subscriptions.py — /api/subscriptions
    planned.py       — /api/planned-income
    stats.py         — /api/stats/*
    goals.py         — /api/goals
    recurring.py     — /api/recurring
    backup.py        — /api/backup/*
"""

import os, logging, sqlite3, threading, time
from flask import Flask, g, jsonify
from flask_cors import CORS
import backup as bkp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

BOT_TOKEN      = os.environ.get("BOT_TOKEN", "")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "")

app = Flask(__name__, static_folder="static")

if ALLOWED_ORIGIN:
    CORS(app, origins=[ALLOWED_ORIGIN])
else:
    CORS(app, origins=["http://localhost:5000", "http://127.0.0.1:5000"])

from db import close_db, init_db, migrate_db, DB_PATH, qall, qone
app.teardown_appcontext(close_db)

from auth import authenticate, auth_bp
app.before_request(authenticate)
app.register_blueprint(auth_bp)

@app.route("/api/bootstrap", methods=["GET"])
def bootstrap():
    from db import uid
    u = uid()
    cfg = qone("SELECT value FROM settings WHERE user_id=? AND key='usd_rate'", (u,))
    return jsonify({
        "accounts":       qall("SELECT * FROM accounts WHERE user_id=? ORDER BY sort_order, id", (u,)),
        "usd_rate":       float(cfg["value"]) if cfg else 90,
        "categories":     qall("SELECT * FROM categories WHERE user_id=? ORDER BY sort_order, id", (u,)),
        "subscriptions":  qall("SELECT * FROM subscriptions WHERE user_id=? ORDER BY sort_order, id", (u,)),
        "planned_income": qall("SELECT * FROM planned_income WHERE user_id=? ORDER BY id", (u,)),
        "goals":          qall("SELECT * FROM savings_goals WHERE user_id=? ORDER BY id", (u,)),
        "recurring":      qall("SELECT * FROM recurring_transactions WHERE user_id=? ORDER BY id", (u,)),
    })

from routes.static_files  import static_bp
from routes.settings      import settings_bp
from routes.accounts      import accounts_bp
from routes.transfers     import transfers_bp
from routes.categories    import categories_bp
from routes.transactions  import transactions_bp
from routes.budgets       import budgets_bp
from routes.subscriptions import subscriptions_bp
from routes.planned       import planned_bp
from routes.stats         import stats_bp
from routes.goals         import goals_bp
from routes.recurring     import recurring_bp
from routes.backup        import backup_bp

for bp in (
    static_bp, settings_bp, accounts_bp, transfers_bp,
    categories_bp, transactions_bp, budgets_bp, subscriptions_bp,
    planned_bp, stats_bp, goals_bp, recurring_bp, backup_bp,
):
    app.register_blueprint(bp)

init_db()
migrate_db()

def _cleanup_sessions():
    while True:
        try:
            db = sqlite3.connect(DB_PATH)
            deleted = db.execute(
                "DELETE FROM sessions WHERE expires_at < datetime('now')"
            ).rowcount
            db.commit()
            db.close()
            if deleted:
                logging.info(f"Session cleanup: removed {deleted} expired session(s)")
        except Exception as e:
            logging.warning(f"Session cleanup error: {e}")
        time.sleep(86400)

threading.Thread(target=_cleanup_sessions, daemon=True, name="session-cleanup").start()
bkp.init(DB_PATH)

if __name__ == "__main__":
    port  = int(os.environ.get("PORT", 5000))
    debug = bool(int(os.environ.get("DEBUG", 0)))
    print(f"🚀  Finance Mini App → http://localhost:{port}")
    if not BOT_TOKEN:
        print("⚠️   BOT_TOKEN not set — running in dev mode (no auth, user_id='dev')")
    app.run(host="0.0.0.0", port=port, debug=debug)
