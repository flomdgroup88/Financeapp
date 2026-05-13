"""
Finance Telegram Mini App — Flask backend
Run: python app.py
"""

import os, json, sqlite3
from datetime import datetime, date, timedelta
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="static")
CORS(app)

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "finance.db"))


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


# ──────────────────────────────────────────────
# Schema + seed
# ──────────────────────────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    balance     REAL NOT NULL DEFAULT 0,
    currency    TEXT NOT NULL DEFAULT 'RUB',
    icon        TEXT NOT NULL DEFAULT '💰',
    color       TEXT NOT NULL DEFAULT '#6366f1',
    is_priority INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT '📦',
    color      TEXT NOT NULL DEFAULT '#6366f1',
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount       REAL NOT NULL,
    type         TEXT NOT NULL CHECK(type IN ('expense','income')),
    description  TEXT,
    date         TEXT NOT NULL DEFAULT (date('now')),
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    amount      REAL NOT NULL,
    currency    TEXT NOT NULL DEFAULT 'RUB',
    period      TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly','yearly')),
    next_date   TEXT,
    description TEXT,
    icon        TEXT NOT NULL DEFAULT '🔔',
    color       TEXT NOT NULL DEFAULT '#6366f1',
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS planned_income (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    amount        REAL NOT NULL,
    description   TEXT,
    expected_date TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_date    ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_type    ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_cat     ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
"""

DEFAULT_ACCOUNTS = [
    ("Наличные",    1000, "RUB", "💵", "#10b981", 0, 1),
    ("Т-Банк",      5000, "RUB", "🏦", "#6366f1", 1, 2),
    ("Альфа Банк",  2000, "RUB", "🔴", "#ef4444", 0, 3),
    ("Сбербанк",    3000, "RUB", "🟢", "#22c55e", 0, 4),
    ("Доллары",      100, "USD", "💵", "#f59e0b", 0, 5),
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
    ("Яндекс Плюс",  299, "RUB", "monthly", "🎵", "#ef4444",  "Музыка, фильмы, такси"),
    ("iCloud",       149, "RUB", "monthly", "☁️", "#0ea5e9",  "50 GB хранилища"),
    ("ChatGPT Plus", 20,  "USD", "monthly", "🤖", "#10b981",  "GPT-4"),
]


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    db.commit()

    # Settings
    db.execute("INSERT OR IGNORE INTO settings VALUES ('usd_rate','90')")

    # Accounts
    if not db.execute("SELECT 1 FROM accounts LIMIT 1").fetchone():
        for name, bal, cur, ico, color, prio, sord in DEFAULT_ACCOUNTS:
            db.execute(
                "INSERT INTO accounts(name,balance,currency,icon,color,is_priority,sort_order) VALUES(?,?,?,?,?,?,?)",
                (name, bal, cur, ico, color, prio, sord),
            )

    # Categories
    if not db.execute("SELECT 1 FROM categories LIMIT 1").fetchone():
        for name, ico, color, sord in DEFAULT_CATEGORIES:
            db.execute(
                "INSERT INTO categories(name,icon,color,sort_order) VALUES(?,?,?,?)",
                (name, ico, color, sord),
            )

    # Subscriptions
    if not db.execute("SELECT 1 FROM subscriptions LIMIT 1").fetchone():
        next_m = (date.today().replace(day=1) + timedelta(days=32)).replace(day=1).isoformat()
        for name, amt, cur, period, ico, color, desc in DEFAULT_SUBS:
            db.execute(
                "INSERT INTO subscriptions(name,amount,currency,period,next_date,icon,color,description) VALUES(?,?,?,?,?,?,?,?)",
                (name, amt, cur, period, next_m, ico, color, desc),
            )

    # Demo transactions (current month)
    if not db.execute("SELECT 1 FROM transactions LIMIT 1").fetchone():
        today_str = date.today().isoformat()
        y, m = date.today().year, date.today().month
        # grab first tbank-like account (id 2) and some categories
        demo = [
            (2, 1, 3500, "expense", "Пятёрочка",   f"{y}-{m:02d}-02"),
            (2, 2, 1200, "expense", "Кофе с другом", f"{y}-{m:02d}-04"),
            (2, 5, 2800, "expense", "Заправка",     f"{y}-{m:02d}-05"),
            (2, 1, 4100, "expense", "Перекрёсток",  f"{y}-{m:02d}-08"),
            (2, 8, 600,  "expense", "Steam",        f"{y}-{m:02d}-10"),
            (2, None, 85000, "income", "Зарплата",  f"{y}-{m:02d}-01"),
            (2, None, 5000,  "income", "Фриланс",   f"{y}-{m:02d}-06"),
        ]
        for acc, cat, amt, tp, desc, dt in demo:
            db.execute(
                "INSERT INTO transactions(account_id,category_id,amount,type,description,date) VALUES(?,?,?,?,?,?)",
                (acc, cat, amt, tp, desc, dt),
            )

        # Prior month comparison data
        prev_m = m - 1 if m > 1 else 12
        prev_y = y if m > 1 else y - 1
        prev_demo = [
            (2, 1, 2800, "expense", "Продукты",     f"{prev_y}-{prev_m:02d}-05"),
            (2, 2, 900,  "expense", "Ресторан",     f"{prev_y}-{prev_m:02d}-12"),
            (2, 5, 3100, "expense", "Бензин",       f"{prev_y}-{prev_m:02d}-18"),
            (2, 8, 1200, "expense", "Игры",         f"{prev_y}-{prev_m:02d}-20"),
            (2, None, 85000, "income", "Зарплата",  f"{prev_y}-{prev_m:02d}-01"),
        ]
        for acc, cat, amt, tp, desc, dt in prev_demo:
            db.execute(
                "INSERT INTO transactions(account_id,category_id,amount,type,description,date) VALUES(?,?,?,?,?,?)",
                (acc, cat, amt, tp, desc, dt),
            )

    db.commit()
    db.close()


# ──────────────────────────────────────────────
# Static (Mini App front-end)
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
        row = qone("SELECT value FROM settings WHERE key='usd_rate'")
        return jsonify({"usd_rate": float(row["value"]) if row else 90})
    data = request.get_json(force=True)
    q("INSERT OR REPLACE INTO settings VALUES('usd_rate',?)", (str(data.get("usd_rate", 90)),))
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Accounts
# ──────────────────────────────────────────────
@app.route("/api/accounts", methods=["GET", "POST"])
def accounts():
    if request.method == "GET":
        rows = qall("SELECT * FROM accounts ORDER BY sort_order, id")
        cfg  = qone("SELECT value FROM settings WHERE key='usd_rate'")
        return jsonify({"accounts": rows, "usd_rate": float(cfg["value"]) if cfg else 90})
    d = request.get_json(force=True)
    if d.get("is_priority"):
        q("UPDATE accounts SET is_priority=0")
    q(
        "INSERT INTO accounts(name,balance,currency,icon,color,is_priority) VALUES(?,?,?,?,?,?)",
        (d["name"], d.get("balance", 0), d.get("currency", "RUB"),
         d.get("icon", "💰"), d.get("color", "#6366f1"), int(bool(d.get("is_priority")))),
    )
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/accounts/<int:aid>", methods=["PUT", "DELETE"])
def account_item(aid):
    if request.method == "DELETE":
        q("DELETE FROM accounts WHERE id=?", (aid,))
        commit()
        return jsonify({"ok": True})
    d = request.get_json(force=True)
    if d.get("is_priority"):
        q("UPDATE accounts SET is_priority=0")
    q(
        "UPDATE accounts SET name=?,balance=?,currency=?,icon=?,color=?,is_priority=? WHERE id=?",
        (d["name"], d.get("balance", 0), d.get("currency", "RUB"),
         d.get("icon", "💰"), d.get("color", "#6366f1"),
         int(bool(d.get("is_priority"))), aid),
    )
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Categories
# ──────────────────────────────────────────────
@app.route("/api/categories", methods=["GET", "POST"])
def categories():
    if request.method == "GET":
        return jsonify({"categories": qall("SELECT * FROM categories ORDER BY sort_order, id")})
    d = request.get_json(force=True)
    q("INSERT INTO categories(name,icon,color) VALUES(?,?,?)",
      (d["name"], d.get("icon", "📦"), d.get("color", "#6366f1")))
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/categories/<int:cid>", methods=["PUT", "DELETE"])
def category_item(cid):
    if request.method == "DELETE":
        q("UPDATE transactions SET category_id=NULL WHERE category_id=?", (cid,))
        q("DELETE FROM categories WHERE id=?", (cid,))
        commit()
        return jsonify({"ok": True})
    d = request.get_json(force=True)
    q("UPDATE categories SET name=?,icon=?,color=? WHERE id=?",
      (d["name"], d.get("icon", "📦"), d.get("color", "#6366f1"), cid))
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Transactions
# ──────────────────────────────────────────────
@app.route("/api/transactions", methods=["GET", "POST"])
def transactions():
    if request.method == "GET":
        clauses, params = [], []
        for key, col in (("type", "t.type"), ("account_id", "t.account_id"), ("category_id", "t.category_id")):
            if request.args.get(key):
                clauses.append(f"{col}=?"); params.append(request.args[key])
        if request.args.get("start_date"):
            clauses.append("t.date>=?"); params.append(request.args["start_date"])
        if request.args.get("end_date"):
            clauses.append("t.date<=?"); params.append(request.args["end_date"])
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        limit = int(request.args.get("limit", 200))
        rows = qall(
            f"""SELECT t.*,
                   c.name  AS category_name,
                   c.icon  AS category_icon,
                   c.color AS category_color,
                   a.name  AS account_name
               FROM transactions t
               LEFT JOIN categories c ON c.id=t.category_id
               LEFT JOIN accounts   a ON a.id=t.account_id
               {where}
               ORDER BY t.date DESC, t.id DESC
               LIMIT ?""",
            params + [limit],
        )
        return jsonify({"transactions": rows})

    d = request.get_json(force=True)
    amount   = float(d.get("amount", 0))
    acc_id   = d.get("account_id")
    tx_type  = d.get("type", "expense")
    tx_date  = d.get("date") or date.today().isoformat()
    cat_id   = d.get("category_id")
    desc     = d.get("description", "")

    if amount <= 0:
        return jsonify({"error": "amount must be > 0"}), 400

    q("INSERT INTO transactions(account_id,category_id,amount,type,description,date) VALUES(?,?,?,?,?,?)",
      (acc_id, cat_id, amount, tx_type, desc, tx_date))

    # Update account balance
    if acc_id:
        delta = -amount if tx_type == "expense" else amount
        q("UPDATE accounts SET balance=balance+? WHERE id=?", (delta, acc_id))

    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/transactions/<int:tid>", methods=["DELETE"])
def transaction_item(tid):
    row = qone("SELECT * FROM transactions WHERE id=?", (tid,))
    if row:
        if row["account_id"]:
            delta = row["amount"] if row["type"] == "expense" else -row["amount"]
            q("UPDATE accounts SET balance=balance+? WHERE id=?", (delta, row["account_id"]))
        q("DELETE FROM transactions WHERE id=?", (tid,))
        commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Subscriptions
# ──────────────────────────────────────────────
@app.route("/api/subscriptions", methods=["GET", "POST"])
def subscriptions():
    if request.method == "GET":
        return jsonify({"subscriptions": qall("SELECT * FROM subscriptions ORDER BY is_active DESC, next_date")})
    d = request.get_json(force=True)
    q(
        "INSERT INTO subscriptions(name,amount,currency,period,next_date,description,icon,color) VALUES(?,?,?,?,?,?,?,?)",
        (d["name"], float(d.get("amount", 0)), d.get("currency", "RUB"),
         d.get("period", "monthly"), d.get("next_date"),
         d.get("description", ""), d.get("icon", "🔔"), d.get("color", "#6366f1")),
    )
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/subscriptions/<int:sid>", methods=["PUT", "DELETE"])
def subscription_item(sid):
    if request.method == "DELETE":
        q("DELETE FROM subscriptions WHERE id=?", (sid,))
        commit()
        return jsonify({"ok": True})
    d = request.get_json(force=True)
    q(
        "UPDATE subscriptions SET name=?,amount=?,currency=?,period=?,next_date=?,description=?,icon=?,color=? WHERE id=?",
        (d["name"], float(d.get("amount", 0)), d.get("currency", "RUB"),
         d.get("period", "monthly"), d.get("next_date"),
         d.get("description", ""), d.get("icon", "🔔"), d.get("color", "#6366f1"), sid),
    )
    commit()
    return jsonify({"ok": True})


@app.route("/api/subscriptions/<int:sid>/toggle", methods=["PUT"])
def subscription_toggle(sid):
    q("UPDATE subscriptions SET is_active = 1 - is_active WHERE id=?", (sid,))
    commit()
    return jsonify({"ok": True})


# ──────────────────────────────────────────────
# Planned income
# ──────────────────────────────────────────────
@app.route("/api/planned-income", methods=["GET", "POST"])
def planned_income():
    if request.method == "GET":
        return jsonify({"planned_income": qall("SELECT * FROM planned_income ORDER BY expected_date, id")})
    d = request.get_json(force=True)
    q("INSERT INTO planned_income(amount,description,expected_date) VALUES(?,?,?)",
      (float(d.get("amount", 0)), d.get("description", ""), d.get("expected_date")))
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@app.route("/api/planned-income/<int:pid>/receive", methods=["PUT"])
def planned_receive(pid):
    row = qone("SELECT * FROM planned_income WHERE id=?", (pid,))
    if not row:
        return jsonify({"error": "not found"}), 404
    acc_id = request.args.get("account_id", type=int)
    tx_date = date.today().isoformat()
    q("INSERT INTO transactions(account_id,category_id,amount,type,description,date) VALUES(?,NULL,?,?,?,?)",
      (acc_id, row["amount"], "income", row["description"] or "Поступление", tx_date))
    if acc_id:
        q("UPDATE accounts SET balance=balance+? WHERE id=?", (row["amount"], acc_id))
    q("DELETE FROM planned_income WHERE id=?", (pid,))
    commit()
    return jsonify({"ok": True})


@app.route("/api/planned-income/<int:pid>", methods=["DELETE"])
def planned_item(pid):
    q("DELETE FROM planned_income WHERE id=?", (pid,))
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
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='expense' AND date>=? AND date<=?",
        (start, end))["v"]
    total_inc = qone(
        "SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='income' AND date>=? AND date<=?",
        (start, end))["v"]

    by_cat = qall(
        """SELECT c.id, c.name, c.icon, c.color,
                  COALESCE(SUM(t.amount),0) AS total
           FROM categories c
           JOIN transactions t ON t.category_id=c.id
           WHERE t.type='expense' AND t.date>=? AND t.date<=?
           GROUP BY c.id ORDER BY total DESC""",
        (start, end),
    )

    daily = qall(
        """SELECT date, COALESCE(SUM(amount),0) AS total
           FROM transactions WHERE type='expense' AND date>=? AND date<=?
           GROUP BY date ORDER BY date""",
        (start, end),
    )

    return jsonify({
        "total_expenses": total_exp,
        "total_income":   total_inc,
        "by_category":    by_cat,
        "daily":          daily,
    })


# ──────────────────────────────────────────────
# Stats — comparison (current vs previous month)
# ──────────────────────────────────────────────
@app.route("/api/stats/comparison")
def stats_comparison():
    today_dt = date.today()
    cy, cm = today_dt.year, today_dt.month
    if cm == 1: py, pm = cy - 1, 12
    else:        py, pm = cy,     cm - 1

    def month_range(y, m):
        return f"{y}-{m:02d}-01", f"{y}-{m:02d}-31"

    cs, ce = month_range(cy, cm)
    ps, pe = month_range(py, pm)

    curr_total = qone("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='expense' AND date>=? AND date<=?", (cs, ce))["v"]
    prev_total = qone("SELECT COALESCE(SUM(amount),0) AS v FROM transactions WHERE type='expense' AND date>=? AND date<=?", (ps, pe))["v"]

    curr_cats = {r["id"]: r for r in qall(
        """SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(t.amount),0) AS total
           FROM categories c JOIN transactions t ON t.category_id=c.id
           WHERE t.type='expense' AND t.date>=? AND t.date<=?
           GROUP BY c.id""", (cs, ce))}
    prev_cats = {r["id"]: r for r in qall(
        """SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(t.amount),0) AS total
           FROM categories c JOIN transactions t ON t.category_id=c.id
           WHERE t.type='expense' AND t.date>=? AND t.date<=?
           GROUP BY c.id""", (ps, pe))}

    all_ids = set(curr_cats) | set(prev_cats)
    comparison = []
    for cid in all_ids:
        c = curr_cats.get(cid) or prev_cats.get(cid)
        curr_a = curr_cats.get(cid, {}).get("total", 0)
        prev_a = prev_cats.get(cid, {}).get("total", 0)
        if prev_a > 0:
            pct = round((curr_a - prev_a) / prev_a * 100)
        elif curr_a > 0:
            pct = 100
        else:
            pct = 0
        comparison.append({
            "id": cid, "name": c["name"], "icon": c["icon"], "color": c["color"],
            "curr_amount": curr_a, "prev_amount": prev_a, "change_pct": pct,
        })
    comparison.sort(key=lambda x: -x["curr_amount"])

    change_pct = 0
    if prev_total > 0:
        change_pct = round((curr_total - prev_total) / prev_total * 100)

    return jsonify({
        "current":    {"total": curr_total},
        "previous":   {"total": prev_total},
        "change_pct": change_pct,
        "comparison": comparison,
    })


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
if __name__ == "__main__":
    init_db()
    port  = int(os.environ.get("PORT", 5000))
    debug = bool(int(os.environ.get("DEBUG", 1)))
    print(f"🚀  Finance Mini App → http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
