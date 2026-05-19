"""
routes/static_files.py — Static file serving for Vite dist build
"""
from flask import Blueprint, send_from_directory, send_file
import os

static_bp = Blueprint("static", __name__)

DIST = os.path.join(os.path.dirname(__file__), "..", "static", "dist")
ICONS = os.path.join(os.path.dirname(__file__), "..", "static", "icons")

ONE_YEAR = "public, max-age=31536000, immutable"
ONE_WEEK = "public, max-age=604800"
NO_CACHE  = "no-cache, no-store, must-revalidate"

@static_bp.route("/")
def index():
    resp = send_from_directory(DIST, "index.html")
    resp.headers["Cache-Control"] = NO_CACHE
    return resp

@static_bp.route("/sw.js")
def service_worker():
    resp = send_from_directory(DIST, "sw.js", mimetype="application/javascript")
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Cache-Control"] = NO_CACHE
    return resp

@static_bp.route("/workbox-<path:rest>")
def workbox(rest):
    resp = send_from_directory(DIST, f"workbox-{rest}")
    resp.headers["Cache-Control"] = ONE_YEAR
    return resp

@static_bp.route("/registerSW.js")
def register_sw():
    resp = send_from_directory(DIST, "registerSW.js", mimetype="application/javascript")
    resp.headers["Cache-Control"] = NO_CACHE
    return resp

@static_bp.route("/manifest.webmanifest")
def manifest():
    resp = send_from_directory(DIST, "manifest.webmanifest",
                               mimetype="application/manifest+json")
    resp.headers["Cache-Control"] = ONE_WEEK
    return resp

@static_bp.route("/assets/<path:filename>")
def assets(filename):
    resp = send_from_directory(os.path.join(DIST, "assets"), filename)
    resp.headers["Cache-Control"] = ONE_YEAR
    return resp

@static_bp.route("/icons/<filename>")
def icons(filename):
    resp = send_from_directory(ICONS, filename)
    resp.headers["Cache-Control"] = ONE_WEEK
    return resp

# Catch-all SPA fallback
@static_bp.route("/<path:path>")
def spa_fallback(path):
    # Serve API routes upstream, everything else → index.html
    if path.startswith("api/"):
        from flask import abort
        abort(404)
    resp = send_from_directory(DIST, "index.html")
    resp.headers["Cache-Control"] = NO_CACHE
    return resp
