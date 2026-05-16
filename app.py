"""
Finance Telegram Mini App — Flask backend v3
Запуск: python app.py

Структура:
  app.py          — точка входа
  db.py           — БД, схема, хелперы
  auth.py         — авторизация
  routes/         — маршруты по темам
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

# ── Health check — Railway проверяет этот эндпоинт ────────────
@app.route("/health")
def health():
    return jsonify({"ok": True}), 200

# ──────────────────────────────────────────────
# Инициализация БД и фоновые задачи
# Запускаем в отдельном потоке — не блокируем старт Gunicorn.
# Gunicorn с --preload выполнит этот код один раз до форка воркеров.
# ──────────────────────────────────────────────
def _startup():
    try:
        init_db()
        migrate_db()
        logging.info("✅ DB ready")
    except Exception as e:
        logging.error(f"DB init error: {e}")

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

# Запускаем сразу — с --preload это выполнится до форка воркеров,
# а без него — при первом импорте модуля (что тоже ок).
_startup()

if __name__ == "__main__":
    port  = int(os.environ.get("PORT", 5000))
    debug = bool(int(os.environ.get("DEBUG", 0)))
    print(f"🚀  Finance Mini App → http://localhost:{port}")
    if not BOT_TOKEN:
        print("⚠️   BOT_TOKEN not set — running in dev mode (no auth, user_id='dev')")
    app.run(host="0.0.0.0", port=port, debug=debug)
