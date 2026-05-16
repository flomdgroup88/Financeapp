"""
auth.py — аутентификация: Telegram initData, сессии, локальный вход.
"""
import hmac, hashlib, json, sqlite3, secrets, urllib.parse
from datetime import datetime, timedelta

from flask import Blueprint, g, jsonify, request

from db import DB_PATH, get_db, qone, commit
from db import DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_SUBS
from db import calc_next_date_from_billing_day

import os
BOT_TOKEN    = os.environ.get("BOT_TOKEN", "")
SESSION_DAYS = 30

auth_bp = Blueprint("auth", __name__)

# ──────────────────────────────────────────────
# Telegram HMAC-SHA256
# ──────────────────────────────────────────────
def verify_telegram_init_data(init_data_raw: str):
    if not init_data_raw:
        return None
    try:
        parsed    = dict(urllib.parse.parse_qsl(init_data_raw, keep_blank_values=True))
        hash_recv = parsed.pop("hash", None)
        if not hash_recv:
            return None
        data_check_str = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        expected   = hmac.new(secret_key, data_check_str.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, hash_recv):
            return None
        user_info = json.loads(parsed.get("user", "{}"))
        uid_str   = str(user_info.get("id", "")).strip()
        return uid_str if uid_str else None
    except Exception:
        return None


# ──────────────────────────────────────────────
# Засев начальных данных для нового пользователя
# ──────────────────────────────────────────────
def seed_user_if_new(user_id: str):
    from datetime import date
    db = get_db()

    if db.execute("SELECT 1 FROM accounts WHERE user_id=? LIMIT 1", (user_id,)).fetchone():
        return

    db.execute(
        "INSERT OR IGNORE INTO settings(user_id,key,value) VALUES(?,?,?)",
        (user_id, "usd_rate", "90"),
    )

    for name, bal, cur, ico, color, prio, rsrv, sord in DEFAULT_ACCOUNTS:
        db.execute(
            "INSERT INTO accounts(user_id,name,balance,currency,icon,color,is_priority,is_reserve,sort_order) VALUES(?,?,?,?,?,?,?,?,?)",
            (user_id, name, bal, cur, ico, color, prio, rsrv, sord),
        )

    for name, ico, color, sord in DEFAULT_CATEGORIES:
        db.execute(
            "INSERT INTO categories(user_id,name,icon,color,sort_order) VALUES(?,?,?,?,?)",
            (user_id, name, ico, color, sord),
        )

    for name, amt, cur, period, ico, color, desc, bd in DEFAULT_SUBS:
        next_d = calc_next_date_from_billing_day(bd)
        db.execute(
            "INSERT INTO subscriptions(user_id,name,amount,currency,period,next_date,billing_day,icon,color,description) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (user_id, name, amt, cur, period, next_d, bd, ico, color, desc),
        )

    accs = db.execute("SELECT id FROM accounts WHERE user_id=? ORDER BY sort_order", (user_id,)).fetchall()
    cats = db.execute("SELECT id FROM categories WHERE user_id=? ORDER BY sort_order", (user_id,)).fetchall()
    if accs and cats:
        acc2 = accs[1]["id"] if len(accs) > 1 else accs[0]["id"]
        def ci(n): return cats[n]["id"] if len(cats) > n else cats[0]["id"]
        y, m = date.today().year, date.today().month
        prev_m = m - 1 if m > 1 else 12
        prev_y = y if m > 1 else y - 1
        demos = [
            (acc2, ci(0), 3500,  "expense", "Пятёрочка",    f"{y}-{m:02d}-02"),
            (acc2, ci(1), 1200,  "expense", "Кофе с другом", f"{y}-{m:02d}-04"),
            (acc2, ci(4), 2800,  "expense", "Заправка",      f"{y}-{m:02d}-05"),
            (acc2, ci(0), 4100,  "expense", "Перекрёсток",   f"{y}-{m:02d}-08"),
            (acc2, ci(7),  600,  "expense", "Steam",         f"{y}-{m:02d}-10"),
            (acc2, None, 85000,  "income",  "Зарплата",      f"{y}-{m:02d}-01"),
            (acc2, None,  5000,  "income",  "Фриланс",       f"{y}-{m:02d}-06"),
            (acc2, ci(0), 2800,  "expense", "Продукты",      f"{prev_y}-{prev_m:02d}-05"),
            (acc2, ci(1),  900,  "expense", "Ресторан",      f"{prev_y}-{prev_m:02d}-12"),
            (acc2, ci(4), 3100,  "expense", "Бензин",        f"{prev_y}-{prev_m:02d}-18"),
            (acc2, ci(7), 1200,  "expense", "Игры",          f"{prev_y}-{prev_m:02d}-20"),
            (acc2, None, 85000,  "income",  "Зарплата",      f"{prev_y}-{prev_m:02d}-01"),
        ]
        for acc, cat, amt, tp, desc, dt in demos:
            db.execute(
                "INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,?,?,?,?,?)",
                (user_id, acc, cat, amt, tp, desc, dt),
            )

        budget_defaults = [(ci(0), 15000), (ci(1), 8000), (ci(4), 6000)]
        for cat_id, limit_amt in budget_defaults:
            db.execute(
                "INSERT OR IGNORE INTO budget_limits(user_id,category_id,amount) VALUES(?,?,?)",
                (user_id, cat_id, limit_amt),
            )

    db.commit()


# ──────────────────────────────────────────────
# Middleware — before_request (регистрируется в app.py)
# ──────────────────────────────────────────────
def authenticate():
    if request.path == "/" or not request.path.startswith("/api"):
        return
    if request.path.startswith("/api/auth/"):
        return

    if not BOT_TOKEN:
        g.user_id = "dev"
        seed_user_if_new("dev")
        return

    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user_id   = verify_telegram_init_data(init_data)
    if user_id:
        g.user_id = user_id
        seed_user_if_new(user_id)
        return

    token = request.headers.get("X-Session-Token", "")
    if token:
        db  = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        row = db.execute(
            "SELECT user_id, expires_at FROM sessions WHERE token=?", (token,)
        ).fetchone()
        db.close()
        if row and row["expires_at"] > datetime.utcnow().isoformat():
            g.user_id = row["user_id"]
            seed_user_if_new(row["user_id"])
            return

    return jsonify({"error": "unauthorized"}), 401


# ──────────────────────────────────────────────
# Хелперы локального входа
# ──────────────────────────────────────────────
def _hash_password(password: str) -> str:
    salt = hashlib.sha256(b"finance-app-salt").digest()
    dk   = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260_000)
    return dk.hex()

def _get_local_user(username: str):
    db  = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    row = db.execute(
        "SELECT value FROM settings WHERE user_id=? AND key='local_password_hash'",
        (f"local_{username}",)
    ).fetchone()
    db.close()
    return {"user_id": f"local_{username}", "hash": row["value"]} if row else None

def _create_session(user_id: str) -> str:
    token   = secrets.token_hex(32)
    expires = (datetime.utcnow() + timedelta(days=SESSION_DAYS)).isoformat()
    db = sqlite3.connect(DB_PATH)
    db.execute("DELETE FROM sessions WHERE expires_at < ? OR user_id=?",
               (datetime.utcnow().isoformat(), user_id))
    db.execute("INSERT INTO sessions(token, user_id, expires_at) VALUES(?,?,?)",
               (token, user_id, expires))
    db.commit()
    db.close()
    return token


# ──────────────────────────────────────────────
# Auth API (публичные маршруты)
# ──────────────────────────────────────────────
@auth_bp.route("/api/auth/status")
def api_auth_status():
    tg_active = bool(BOT_TOKEN)
    db  = sqlite3.connect(DB_PATH)
    row = db.execute(
        "SELECT 1 FROM settings WHERE key='local_password_hash' LIMIT 1"
    ).fetchone()
    db.close()
    return jsonify({"telegram": tg_active, "local_auth_configured": bool(row)})


@auth_bp.route("/api/auth/setup", methods=["POST"])
def api_auth_setup():
    d        = request.get_json(force=True) or {}
    username = (d.get("username") or "").strip().lower()
    password = (d.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Заполните логин и пароль"}), 400
    if len(username) < 3 or len(username) > 32:
        return jsonify({"error": "Логин: от 3 до 32 символов"}), 400
    if len(password) < 6:
        return jsonify({"error": "Пароль: минимум 6 символов"}), 400

    user_id = f"local_{username}"
    if _get_local_user(username):
        return jsonify({"error": "Пользователь уже существует"}), 409

    db = sqlite3.connect(DB_PATH)
    db.execute(
        "INSERT INTO settings(user_id, key, value) VALUES(?,?,?)",
        (user_id, "local_password_hash", _hash_password(password))
    )
    db.commit()
    db.close()

    from flask import current_app
    with current_app.app_context():
        g._db = sqlite3.connect(DB_PATH)
        g._db.row_factory = sqlite3.Row
        g._db.execute("PRAGMA journal_mode=WAL")
        g.user_id = user_id
        seed_user_if_new(user_id)
        g._db.close()

    token = _create_session(user_id)
    return jsonify({"ok": True, "token": token, "user_id": user_id})


@auth_bp.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    d        = request.get_json(force=True) or {}
    username = (d.get("username") or "").strip().lower()
    password = (d.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Заполните логин и пароль"}), 400

    user = _get_local_user(username)
    if not user:
        return jsonify({"error": "Неверный логин или пароль"}), 401

    if not hmac.compare_digest(_hash_password(password), user["hash"]):
        return jsonify({"error": "Неверный логин или пароль"}), 401

    token = _create_session(user["user_id"])
    return jsonify({"ok": True, "token": token, "user_id": user["user_id"]})


@auth_bp.route("/api/auth/logout", methods=["POST"])
def api_auth_logout():
    token = request.headers.get("X-Session-Token", "")
    if token:
        db = sqlite3.connect(DB_PATH)
        db.execute("DELETE FROM sessions WHERE token=?", (token,))
        db.commit()
        db.close()
    return jsonify({"ok": True})
