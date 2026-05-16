"""
db.py — подключение к SQLite, схема, хелперы, дефолтные данные.
"""
import os, sqlite3, calendar
from datetime import date
from flask import g

_data_dir = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH") or os.path.dirname(__file__)
DB_PATH   = os.path.join(_data_dir, "finance.db")

# ──────────────────────────────────────────────
# Соединение (одно на запрос, через Flask g)
# ──────────────────────────────────────────────
def get_db():
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
    return db

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
# Схема
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

CREATE INDEX IF NOT EXISTS idx_tx_user      ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_date      ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_type      ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_cat       ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_account   ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_acc_user     ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_cat_user     ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_user     ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_bl_user      ON budget_limits(user_id);

CREATE TABLE IF NOT EXISTS savings_goals (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT NOT NULL DEFAULT 'default',
    name           TEXT NOT NULL,
    target_amount  REAL NOT NULL,
    saved_amount   REAL NOT NULL DEFAULT 0,
    icon           TEXT NOT NULL DEFAULT '🎯',
    color          TEXT NOT NULL DEFAULT '#6366f1',
    description    TEXT,
    deadline       TEXT,
    created_at     TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT NOT NULL DEFAULT 'default',
    name         TEXT NOT NULL,
    amount       REAL NOT NULL,
    type         TEXT NOT NULL CHECK(type IN ('expense','income')),
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    account_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    period       TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('daily','weekly','monthly','yearly')),
    day_of_month INTEGER,
    next_date    TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1,
    description  TEXT,
    icon         TEXT NOT NULL DEFAULT '🔄',
    color        TEXT NOT NULL DEFAULT '#6366f1',
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goal_user ON savings_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_rec_user  ON recurring_transactions(user_id);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_id);
"""

# ──────────────────────────────────────────────
# Дефолтные данные для новых пользователей
# ──────────────────────────────────────────────
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

# ──────────────────────────────────────────────
# Инициализация и миграции
# ──────────────────────────────────────────────
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
    """Безопасные миграции для существующих баз."""
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
        """CREATE TABLE IF NOT EXISTS budget_limits (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL DEFAULT 'default',
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            amount      REAL NOT NULL,
            created_at  TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, category_id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_bl_user ON budget_limits(user_id)",
        "ALTER TABLE subscriptions  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        """CREATE TABLE IF NOT EXISTS savings_goals (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        TEXT NOT NULL DEFAULT 'default',
            name           TEXT NOT NULL,
            target_amount  REAL NOT NULL,
            saved_amount   REAL NOT NULL DEFAULT 0,
            icon           TEXT NOT NULL DEFAULT '🎯',
            color          TEXT NOT NULL DEFAULT '#6366f1',
            description    TEXT,
            deadline       TEXT,
            created_at     TEXT DEFAULT (date('now'))
        )""",
        """CREATE TABLE IF NOT EXISTS recurring_transactions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      TEXT NOT NULL DEFAULT 'default',
            name         TEXT NOT NULL,
            amount       REAL NOT NULL,
            type         TEXT NOT NULL CHECK(type IN ('expense','income')),
            category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            account_id   INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            period       TEXT NOT NULL DEFAULT 'monthly',
            day_of_month INTEGER,
            next_date    TEXT,
            is_active    INTEGER NOT NULL DEFAULT 1,
            description  TEXT,
            icon         TEXT NOT NULL DEFAULT '🔄',
            color        TEXT NOT NULL DEFAULT '#6366f1',
            created_at   TEXT DEFAULT (datetime('now'))
        )""",
        "CREATE INDEX IF NOT EXISTS idx_goal_user ON savings_goals(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_rec_user  ON recurring_transactions(user_id)",
        """CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date)",
    ]
    for sql in migrations:
        try:
            db.execute(sql)
        except Exception:
            pass
    db.commit()
    db.close()
