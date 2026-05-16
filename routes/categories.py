"""
routes/categories.py — маршруты: Категории
"""
from datetime import date, datetime, timedelta
import calendar

from flask import Blueprint, jsonify, request, g, send_from_directory, send_file

from db import q, qone, qall, commit, uid, get_db, DB_PATH

categories_bp = Blueprint("categories", __name__)

@categories_bp.route("/api/categories", methods=["GET", "POST"])
def categories():
    if request.method == "GET":
        return jsonify({"categories": qall(
            "SELECT * FROM categories WHERE user_id=? ORDER BY sort_order, id", (uid(),))})
    d = request.get_json(force=True)
    q("INSERT INTO categories(user_id,name,icon,color) VALUES(?,?,?,?)",
      (uid(), d["name"], d.get("icon", "📦"), d.get("color", "#6366f1")))
    commit()
    return jsonify({"ok": True, "id": get_db().lastrowid})


@categories_bp.route("/api/categories/<int:cid>", methods=["PUT", "DELETE"])
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


@categories_bp.route("/api/categories/<int:cid>/move", methods=["PUT"])
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
