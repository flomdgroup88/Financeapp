"""
routes/static_files.py — маршруты: Статические файлы
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

static_bp = Blueprint("static", __name__)

# ──────────────────────────────────────────────
# Стратегия кэширования:
#   index.html        — no-cache  (браузер всегда проверяет новую версию)
#   style.css, JS     — 1 год     (меняем имя файла = cache bust)
#   иконки, manifest  — 1 неделя  (редко меняются)
#   sw.js             — no-cache  (Service Worker обязан обновляться сразу)
ONE_YEAR = "public, max-age=31536000, immutable"
ONE_WEEK = "public, max-age=604800"
NO_CACHE = "no-cache"

@static_bp.route("/")
def index():
    resp = send_from_directory("static", "index.html")
    resp.headers["Cache-Control"] = NO_CACHE
    return resp

@static_bp.route("/static/style.css")
def stylesheet():
    resp = send_from_directory("static", "style.css", mimetype="text/css")
    resp.headers["Cache-Control"] = ONE_YEAR
    return resp

@static_bp.route("/manifest.json")
def manifest():
    resp = send_from_directory("static", "manifest.json",
                               mimetype="application/manifest+json")
    resp.headers["Cache-Control"] = ONE_WEEK
    return resp

@static_bp.route("/sw.js")
def service_worker():
    resp = send_from_directory("static", "sw.js",
                               mimetype="application/javascript")
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Cache-Control"] = NO_CACHE
    return resp

@static_bp.route("/icons/<filename>")
def icons(filename):
    resp = send_from_directory("static/icons", filename)
    resp.headers["Cache-Control"] = ONE_WEEK
    return resp

@static_bp.route("/static/js/<filename>")
def js_files(filename):
    resp = send_from_directory("static/js", filename,
                               mimetype="application/javascript")
    # init.js меняется редко, остальные JS — через cache bust при деплое
    resp.headers["Cache-Control"] = ONE_YEAR
    return resp


# ──────────────────────────────────────────────
# Settings
# ──────────────────────────────────────────────
