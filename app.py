"""
Finance Telegram Mini App — Flask backend v3
Run: python app.py
"""

import os, json, sqlite3, calendar, hmac, hashlib, urllib.parse
from datetime import datetime, date, timedelta
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="static")
CORS(app)

DB_PATH   = os.path.join(os.path.dirname(__file__), "finance.db")
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")   # Required in production


# ──────────────────────────────────────────────
# Telegram initData verification (HMAC-SHA256)
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


@app.before_request
def authenticate():
    if request.path == "/" or not request.path.startswith("/api"):
        return

    if not BOT_TOKEN:
        g.user_id = "dev"
        _seed_user_if_new("dev")
        return

    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user_id   = verify_telegram_init_data(init_data)
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401

    g.user_id = user_id
    _seed_user_if_new(user_id)


def _seed_user_if_new(user_id: str):
    # Используем get_db() вместо отдельного соединения,
    # чтобы не открывать два одновременных коннекта в рамках одного запроса.
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

        # Default budget limits for new users
        budget_defaults = [
            (ci(0), 15000),  # Продукты
            (ci(1),  8000),  # Рестораны
            (ci(4),  6000),  # Бензин
        ]
        for cat_id, limit_amt in budget_defaults:
            db.execute(
                "INSERT OR IGNORE INTO budget_limits(user_id,category_id,amount) VALUES(?,?,?)",
                (user_id, cat_id, limit_amt),
            )

    db.commit()  # commit через общий коннект; close_db() закроет его по завершении запроса


# ──────────────────────────────────────────────
# DB helpers
# ──────────────────────────────────────────────
def get_db():
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
    return db


@app.teardown_appcontext
def close_db(exc):
    db = getattr(g, "_db", None)
    if db:
        db.close()


def q(sql, params=()):
    return get_db().execute(sql, params)

def qone(sql, params=()):
    row = q(sql, params).fetchone()
    return dict(row) if row else None

def qall(sql, params=()):
    return [dict(r) for r in q(sql, params).fetchall()]

def commit():
    get_db().commit()

def uid():
    return g.user_id


# ──────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT NOT NULL DEFAULT 'default',
    key     TEXT NOT NULL,
    value   TEXT,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL DEFAULT 'default',
    name        TEXT NOT NULL,
    balance     REAL NOT NULL DEFAULT 0,
    currency    TEXT NOT NULL DEFAULT 'RUB',
    icon        TEXT NOT NULL DEFAULT '💰',
    color       TEXT NOT NULL DEFAULT '#6366f1',
    is_priority INTEGER NOT NULL DEFAULT 0,
    is_reserve  INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL DEFAULT 'default',
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT '📦',
    color      TEXT NOT NULL DEFAULT '#6366f1',
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT NOT NULL DEFAULT 'default',
    account_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount       REAL NOT NULL,
    type         TEXT NOT NULL CHECK(type IN ('expense','income','transfer')),
    description  TEXT,
    date         TEXT NOT NULL DEFAULT (date('now')),
    created_at   TEXT DEFAULT (datetime('now')),
    paired_tx_id INTEGER
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL DEFAULT 'default',
    name        TEXT NOT NULL,
    amount      REAL NOT NULL,
    currency    TEXT NOT NULL DEFAULT 'RUB',
    period      TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly','yearly')),
    next_date   TEXT,
    billing_day INTEGER,
    account_id  INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    description TEXT,
    icon        TEXT NOT NULL DEFAULT '🔔',
    color       TEXT NOT NULL DEFAULT '#6366f1',
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS planned_income (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL DEFAULT 'default',
    amount        REAL NOT NULL,
    description   TEXT,
    expected_date TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_limits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL DEFAULT 'default',
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount      REAL NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_tx_user    ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_date    ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_type    ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_cat     ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_acc_user   ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_cat_user   ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_user   ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_bl_user    ON budget_limits(user_id);
"""

DEFAULT_ACCOUNTS = [
    ("Наличные",    1000, "RUB", "💵", "#10b981", 0, 0, 1),
    ("Т-Банк",      5000, "RUB", "🏦", "#6366f1", 1, 0, 2),
    ("Альфа Банк",  2000, "RUB", "🔴", "#ef4444", 0, 0, 3),
    ("Сбербанк",    3000, "RUB", "🟢", "#22c55e", 0, 0, 4),
    ("Доллары",      100, "USD", "💵", "#f59e0b", 0, 0, 5),
    ("Резервный",  15000, "RUB", "🏦", "#64748b", 0, 1, 6),
]

DEFAULT_CATEGORIES = [
    ("Продукты",        "🛒", "#10b981",  1),
    ("Рестораны",       "🍽️", "#f59e0b",  2),
    ("Одежда",          "👕", "#8b5cf6",  3),
    ("Спорт",           "⚽", "#06b6d4",  4),
    ("Бензин",          "⛽", "#f97316",  5),
    ("Автосервис",      "🔧", "#64748b",  6),
    ("Дом",             "🏠", "#84cc16",  7),
    ("Развлечения",     "🎮", "#ec4899",  8),
    ("Мобильный",       "📱", "#6366f1",  9),
    ("Интернет",        "🌐", "#0ea5e9", 10),
    ("Техника",         "💻", "#a855f7", 11),
    ("Медицина",        "💊", "#ef4444", 12),
    ("Подарки",         "🎁", "#f43f5e", 13),
    ("Игрушки",         "🧸", "#fb923c", 14),
    ("Такси",           "🚕", "#fbbf24", 15),
    ("Тусовки",         "🎉", "#e879f9", 16),
    ("Общ. транспорт",  "🚌", "#38bdf8", 17),
    ("Подписки",        "📋", "#818cf8", 18),
    ("Блог",            "📹", "#fb7185", 19),
    ("Кружки Льва",     "🎓", "#4ade80", 20),
    ("Платная дорога",  "🛣️", "#a3e635", 21),
    ("Прочее",          "📦", "#94a3b8", 22),
]

DEFAULT_SUBS = [
    ("Яндекс Плюс",  299, "RUB", "monthly", "🎵", "#ef4444", "Музыка, фильмы, такси", 15),
    ("iCloud",       149, "RUB", "monthly", "☁️", "#0ea5e9", "50 GB хранилища",       1),
    ("ChatGPT Plus",  20, "USD", "monthly", "🤖", "#10b981", "GPT-4",                  20),
]


def calc_next_date_from_billing_day(billing_day, base_date=None):
    today_dt = base_date or date.today()
    bd = int(billing_day)
    last_day = calendar.monthrange(today_dt.year, today_dt.month)[1]
    day = min(bd, last_day)
    if today_dt.day <= day:
        return date(today_dt.year, today_dt.month, day).isoformat()
    nm = today_dt.month + 1 if today_dt.month < 12 else 1
    ny = today_dt.year if today_dt.month < 12 else today_dt.year + 1
    last_day_nm = calendar.monthrange(ny, nm)[1]
    return date(ny, nm, min(bd, last_day_nm)).isoformat()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA)
    db.commit()
    db.close()


def migrate_db():
    """Safe migrations for existing databases."""
    db = sqlite3.connect(DB_PATH)
    migrations = [
        "ALTER TABLE accounts       ADD COLUMN is_reserve   INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE subscriptions  ADD COLUMN billing_day  INTEGER",
        "ALTER TABLE subscriptions  ADD COLUMN account_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL",
        "ALTER TABLE transactions   ADD COLUMN paired_tx_id INTEGER",
        "ALTER TABLE settings       ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'",
        "ALTER TABLE accounts       ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'",
        "ALTER TABLE categories     ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'",
        "ALTER TABLE transactions   ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'",
        "ALTER TABLE subscriptions  ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'",
        "ALTER TABLE planned_income ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'",
        "CREATE INDEX IF NOT EXISTS idx_tx_user  ON transactions(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_acc_user ON accounts(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(user_id)",
        # v3 migrations
        """CREATE TABLE IF NOT EXISTS budget_limits (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL DEFAULT 'default',
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            amount      REAL NOT NULL,
            created_at  TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, category_id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_bl_user ON budget_limits(user_id)",
    ]
    for sql in migrations:
        try:
            db.execute(sql)
        except Exception:
            pass
    db.commit()
    db.close()


# ──────────────────────────────────────────────
# Static
# ──────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ──────────────────────────────────────────────
# Settings
# ──────────────────────────────────────────────
@app.route("/api/settings", methods=["GET", "POST"])
def settings():
    if request.method == "GET":
        row = qone("SELECT value FROM settings WHERE user_id=? AND key='usd_rate'", (uid(),))
        return jsonify({"usd_rate": float(row["value"]) if row else 90})
    data = request.get_json(force=True)
    q("INSERT OR REPLACE INTO settings(user_id,key,value) VALUES(?,?,?)",
      (uid(), "usd_rate", str(data.get("usd_rate", 90))))
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Accounts
# ──────────────────────────────────────────────
@app.route("/api/accounts", methods=["GET", "POST"])
def accounts():
    if request.method == "GET":
        rows = qall("SELECT * FROM accounts WHERE user_id=? ORDER BY sort_order, id", (uid(),))
        cfg  = qone("SELECT value FROM settings WHERE user_id=? AND key='usd_rate'", (uid(),))
        return jsonify({"accounts": rows, "usd_rate": float(cfg["value"]) if cfg else 90})
    d = request.get_json(force=True)
    if d.get("is_priority"):
        q("UPDATE accounts SET is_priority=0 WHERE user_id=?", (uid(),))
    max_order = qone("SELECT COALESCE(MAX(sort_order),0) AS v FROM accounts WHERE user_id=?", (uid(),))["v"]
    q("INSERT INTO accounts(user_id,name,balance,currency,icon,color,is_priority,is_reserve,sort_order) VALUES(?,?,?,?,?,?,?,?,?)",
      (uid(), d["name"], d.get("balance", 0), d.get("currency", "RUB"),
       d.get("icon", "💰"), d.get("color", "#6366f1"),
       int(bool(d.get("is_priority"))), int(bool(d.get("is_reserve"))), max_order + 1))
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/accounts/<int:aid>", methods=["PUT", "DELETE"])
def account_item(aid):
    if request.method == "DELETE":
        q("DELETE FROM accounts WHERE id=? AND user_id=?", (aid, uid()))
        commit()
        return jsonify({"ok": True})
    d = request.get_json(force=True)
    if d.get("is_priority"):
        q("UPDATE accounts SET is_priority=0 WHERE user_id=?", (uid(),))
    q("UPDATE accounts SET name=?,balance=?,currency=?,icon=?,color=?,is_priority=?,is_reserve=? WHERE id=? AND user_id=?",
      (d["name"], d.get("balance", 0), d.get("currency", "RUB"),
       d.get("icon", "💰"), d.get("color", "#6366f1"),
       int(bool(d.get("is_priority"))), int(bool(d.get("is_reserve"))), aid, uid()))
    commit()
    return jsonify({"ok": True})


@app.route("/api/accounts/<int:aid>/move", methods=["PUT"])
def account_move(aid):
    d   = request.get_json(force=True)
    row = qone("SELECT id, sort_order FROM accounts WHERE id=? AND user_id=?", (aid, uid()))
    if not row:
        return jsonify({"error": "not found"}), 404
    current = row["sort_order"]
    if d.get("direction", "up") == "up":
        other = qone("SELECT id, sort_order FROM accounts WHERE user_id=? AND sort_order<? ORDER BY sort_order DESC LIMIT 1", (uid(), current))
    else:
        other = qone("SELECT id, sort_order FROM accounts WHERE user_id=? AND sort_order>? ORDER BY sort_order ASC LIMIT 1",  (uid(), current))
    if other:
        q("UPDATE accounts SET sort_order=? WHERE id=? AND user_id=?", (other["sort_order"], aid, uid()))
        q("UPDATE accounts SET sort_order=? WHERE id=? AND user_id=?", (current, other["id"], uid()))
        commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Transfers
# ──────────────────────────────────────────────
@app.route("/api/transfers", methods=["POST"])
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
    q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,NULL,?,?,?,?)",
      (uid(), from_id, amount,    "transfer", f"{label} → {to_acc['name']}", tx_date))
    q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,NULL,?,?,?,?)",
      (uid(), to_id,   to_amount, "transfer", f"{label} ← {from_acc['name']}", tx_date))

    commit()
    return jsonify({"ok": True, "to_amount": to_amount})


# ──────────────────────────────────────────────
# Categories
# ──────────────────────────────────────────────
@app.route("/api/categories", methods=["GET", "POST"])
def categories():
    if request.method == "GET":
        return jsonify({"categories": qall(
            "SELECT * FROM categories WHERE user_id=? ORDER BY sort_order, id", (uid(),))})
    d = request.get_json(force=True)
    q("INSERT INTO categories(user_id,name,icon,color) VALUES(?,?,?,?)",
      (uid(), d["name"], d.get("icon", "📦"), d.get("color", "#6366f1")))
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/categories/<int:cid>", methods=["PUT", "DELETE"])
def category_item(cid):
    if request.method == "DELETE":
        q("UPDATE transactions SET category_id=NULL WHERE category_id=? AND user_id=?", (cid, uid()))
        q("DELETE FROM budget_limits WHERE category_id=? AND user_id=?", (cid, uid()))
        q("DELETE FROM categories WHERE id=? AND user_id=?", (cid, uid()))
        commit()
        return jsonify({"ok": True})
    d = request.get_json(force=True)
    q("UPDATE categories SET name=?,icon=?,color=? WHERE id=? AND user_id=?",
      (d["name"], d.get("icon", "📦"), d.get("color", "#6366f1"), cid, uid()))
    commit()
    return jsonify({"ok": True})


@app.route("/api/categories/<int:cid>/move", methods=["PUT"])
def category_move(cid):
    d   = request.get_json(force=True)
    row = qone("SELECT id, sort_order FROM categories WHERE id=? AND user_id=?", (cid, uid()))
    if not row:
        return jsonify({"error": "not found"}), 404
    current = row["sort_order"]
    if d.get("direction", "up") == "up":
        other = qone("SELECT id, sort_order FROM categories WHERE user_id=? AND sort_order<? ORDER BY sort_order DESC LIMIT 1", (uid(), current))
    else:
        other = qone("SELECT id, sort_order FROM categories WHERE user_id=? AND sort_order>? ORDER BY sort_order ASC LIMIT 1",  (uid(), current))
    if other:
        q("UPDATE categories SET sort_order=? WHERE id=? AND user_id=?", (other["sort_order"], cid, uid()))
        q("UPDATE categories SET sort_order=? WHERE id=? AND user_id=?", (current, other["id"], uid()))
        commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Transactions
# ──────────────────────────────────────────────
@app.route("/api/transactions", methods=["GET", "POST"])
def transactions():
    if request.method == "GET":
        clauses = ["t.user_id=?"]
        params  = [uid()]
        for key, col in (("type","t.type"), ("account_id","t.account_id"), ("category_id","t.category_id")):
            if request.args.get(key):
                clauses.append(f"{col}=?"); params.append(request.args[key])
        if request.args.get("start_date"):
            clauses.append("t.date>=?"); params.append(request.args["start_date"])
        if request.args.get("end_date"):
            clauses.append("t.date<=?"); params.append(request.args["end_date"])
        where = "WHERE " + " AND ".join(clauses)
        limit = int(request.args.get("limit", 200))
        rows  = qall(
            f"""SELECT t.*,
                   c.name  AS category_name,
                   c.icon  AS category_icon,
                   c.color AS category_color,
                   a.name  AS account_name
               FROM transactions t
               LEFT JOIN categories c ON c.id=t.category_id
               LEFT JOIN accounts   a ON a.id=t.account_id
               {where}
               ORDER BY t.date DESC, t.id DESC LIMIT ?""",
            params + [limit])
        return jsonify({"transactions": rows})

    d       = request.get_json(force=True)
    amount  = float(d.get("amount", 0))
    acc_id  = d.get("account_id")
    tx_type = d.get("type", "expense")
    tx_date = d.get("date") or date.today().isoformat()
    cat_id  = d.get("category_id")
    desc    = d.get("description", "")

    if amount <= 0:
        return jsonify({"error": "amount must be > 0"}), 400

    q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,?,?,?,?,?)",
      (uid(), acc_id, cat_id, amount, tx_type, desc, tx_date))

    if acc_id:
        delta = -amount if tx_type == "expense" else amount
        q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?", (delta, acc_id, uid()))

    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/transactions/<int:tid>", methods=["DELETE", "PUT"])
def transaction_item(tid):
    if request.method == "DELETE":
        row = qone("SELECT * FROM transactions WHERE id=? AND user_id=?", (tid, uid()))
        if row:
            if row["account_id"] and row["type"] in ("expense", "income"):
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

    # Transfers can't be edited (they're paired)
    if old["type"] == "transfer":
        return jsonify({"error": "transfers cannot be edited"}), 400

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
@app.route("/api/budget-limits", methods=["GET", "POST"])
def budget_limits():
    if request.method == "GET":
        year  = int(request.args.get("year",  date.today().year))
        month = int(request.args.get("month", date.today().month))
        start = f"{year}-{month:02d}-01"
        end   = f"{year}-{month:02d}-31"
        limits = qall(
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
        return jsonify({"budget_limits": limits})

    d      = request.get_json(force=True)
    cat_id = d.get("category_id")
    amount = float(d.get("amount", 0))
    if not cat_id:
        return jsonify({"error": "category_id required"}), 400
    if amount <= 0:
        # Delete the limit if amount is 0
        q("DELETE FROM budget_limits WHERE user_id=? AND category_id=?", (uid(), cat_id))
        commit()
        return jsonify({"ok": True, "deleted": True})
    q("INSERT INTO budget_limits(user_id, category_id, amount) VALUES(?,?,?) "
      "ON CONFLICT(user_id, category_id) DO UPDATE SET amount=excluded.amount",
      (uid(), cat_id, amount))
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/budget-limits/<int:bid>", methods=["DELETE"])
def budget_limit_item(bid):
    q("DELETE FROM budget_limits WHERE id=? AND user_id=?", (bid, uid()))
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Subscriptions
# ──────────────────────────────────────────────
@app.route("/api/subscriptions", methods=["GET", "POST"])
def subscriptions():
    if request.method == "GET":
        return jsonify({"subscriptions": qall(
            "SELECT * FROM subscriptions WHERE user_id=? ORDER BY is_active DESC, next_date", (uid(),))})
    d           = request.get_json(force=True)
    billing_day = d.get("billing_day")
    next_date   = d.get("next_date")
    if d.get("period") == "monthly" and billing_day:
        next_date = calc_next_date_from_billing_day(billing_day)
    q("INSERT INTO subscriptions(user_id,name,amount,currency,period,next_date,billing_day,account_id,description,icon,color) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      (uid(), d["name"], float(d.get("amount", 0)), d.get("currency", "RUB"),
       d.get("period", "monthly"), next_date, billing_day,
       d.get("account_id"), d.get("description", ""),
       d.get("icon", "🔔"), d.get("color", "#6366f1")))
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/subscriptions/<int:sid>", methods=["PUT", "DELETE"])
def subscription_item(sid):
    if request.method == "DELETE":
        q("DELETE FROM subscriptions WHERE id=? AND user_id=?", (sid, uid()))
        commit()
        return jsonify({"ok": True})
    d           = request.get_json(force=True)
    billing_day = d.get("billing_day")
    next_date   = d.get("next_date")
    if d.get("period") == "monthly" and billing_day:
        next_date = calc_next_date_from_billing_day(billing_day)
    q("UPDATE subscriptions SET name=?,amount=?,currency=?,period=?,next_date=?,billing_day=?,account_id=?,description=?,icon=?,color=? WHERE id=? AND user_id=?",
      (d["name"], float(d.get("amount", 0)), d.get("currency", "RUB"),
       d.get("period", "monthly"), next_date, billing_day,
       d.get("account_id"), d.get("description", ""),
       d.get("icon", "🔔"), d.get("color", "#6366f1"), sid, uid()))
    commit()
    return jsonify({"ok": True})


@app.route("/api/subscriptions/<int:sid>/toggle", methods=["PUT"])
def subscription_toggle(sid):
    q("UPDATE subscriptions SET is_active=1-is_active WHERE id=? AND user_id=?", (sid, uid()))
    commit()
    return jsonify({"ok": True})


@app.route("/api/subscriptions/<int:sid>/charge", methods=["POST"])
def subscription_charge(sid):
    sub = qone("SELECT * FROM subscriptions WHERE id=? AND user_id=?", (sid, uid()))
    if not sub:
        return jsonify({"error": "not found"}), 404

    d      = request.get_json(force=True) if (request.content_length or 0) > 0 else {}
    acc_id = d.get("account_id") or sub.get("account_id")

    if not acc_id:
        prio = qone("SELECT id FROM accounts WHERE user_id=? AND is_priority=1 AND is_reserve=0 LIMIT 1", (uid(),))
        if prio:
            acc_id = prio["id"]
    if not acc_id:
        return jsonify({"error": "no account available"}), 400

    amount  = sub["amount"]
    tx_date = date.today().isoformat()

    q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,NULL,?,?,?,?)",
      (uid(), acc_id, amount, "expense", f"Подписка: {sub['name']}", tx_date))
    q("UPDATE accounts SET balance=balance-? WHERE id=? AND user_id=?", (amount, acc_id, uid()))

    if sub["period"] == "monthly":
        billing_day = sub.get("billing_day") or 1
        today_dt = date.today()
        nm = today_dt.month + 1 if today_dt.month < 12 else 1
        ny = today_dt.year if today_dt.month < 12 else today_dt.year + 1
        next_date = date(ny, nm, min(billing_day, calendar.monthrange(ny, nm)[1])).isoformat()
    else:
        if sub["next_date"]:
            nd = date.fromisoformat(sub["next_date"])
            try:    next_date = nd.replace(year=nd.year + 1).isoformat()
            except: next_date = nd.replace(year=nd.year + 1, day=28).isoformat()
        else:
            next_date = (date.today() + timedelta(days=365)).isoformat()

    q("UPDATE subscriptions SET next_date=? WHERE id=? AND user_id=?", (next_date, sid, uid()))
    commit()
    return jsonify({"ok": True, "next_date": next_date, "account_id": acc_id})


# ──────────────────────────────────────────────
# Planned income
# ──────────────────────────────────────────────
@app.route("/api/planned-income", methods=["GET", "POST"])
def planned_income():
    if request.method == "GET":
        return jsonify({"planned_income": qall(
            "SELECT * FROM planned_income WHERE user_id=? ORDER BY expected_date, id", (uid(),))})
    d = request.get_json(force=True)
    q("INSERT INTO planned_income(user_id,amount,description,expected_date) VALUES(?,?,?,?)",
      (uid(), float(d.get("amount", 0)), d.get("description", ""), d.get("expected_date")))
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/planned-income/<int:pid>/receive", methods=["PUT"])
def planned_receive(pid):
    row = qone("SELECT * FROM planned_income WHERE id=? AND user_id=?", (pid, uid()))
    if not row:
        return jsonify({"error": "not found"}), 404
    acc_id  = request.args.get("account_id", type=int)
    tx_date = date.today().isoformat()
    q("INSERT INTO transactions(user_id,account_id,category_id,amount,type,description,date) VALUES(?,?,NULL,?,?,?,?)",
      (uid(), acc_id, row["amount"], "income", row["description"] or "Поступление", tx_date))
    if acc_id:
        q("UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?", (row["amount"], acc_id, uid()))
    q("DELETE FROM planned_income WHERE id=? AND user_id=?", (pid, uid()))
    commit()
    return jsonify({"ok": True})


@app.route("/api/planned-income/<int:pid>", methods=["DELETE"])
def planned_item(pid):
    q("DELETE FROM planned_income WHERE id=? AND user_id=?", (pid, uid()))
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Stats — monthly
# ──────────────────────────────────────────────
@app.route("/api/stats/monthly")
def stats_monthly():
    year  = int(request.args.get("year",  date.today().year))
    month = int(request.args.get("month", date.today().month))
    start = f"{year}-{month:02d}-01"
    end   = f"{year}-{month:02d}-31"

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
@app.route("/api/stats/comparison")
def stats_comparison():
    today_dt = date.today()
    cy, cm   = today_dt.year, today_dt.month
    py, pm   = (cy - 1, 12) if cm == 1 else (cy, cm - 1)

    def mr(y, m): return f"{y}-{m:02d}-01", f"{y}-{m:02d}-31"
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
# Main
# ──────────────────────────────────────────────
init_db()
migrate_db()

if __name__ == "__main__":
    port  = int(os.environ.get("PORT",  5000))
    debug = bool(int(os.environ.get("DEBUG", 0)))
    print(f"🚀  Finance Mini App v3 → http://localhost:{port}")
    if not BOT_TOKEN:
        print("⚠️   BOT_TOKEN not set — running in dev mode (no auth, user_id='dev')")
    app.run(host="0.0.0.0", port=port, debug=debug)
