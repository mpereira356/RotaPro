from functools import wraps

from flask import g, jsonify, redirect, request, session, url_for

from .models import User


def load_current_user():
    user_id = session.get("user_id")
    if not user_id:
        g.current_user = None
        return
    g.current_user = User.query.get(user_id)


def login_user(user):
    session["user_id"] = user.id


def logout_user():
    session.pop("user_id", None)


def login_required(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        if g.get("current_user"):
            return view_func(*args, **kwargs)

        if request.path.startswith("/api/"):
            return jsonify({"error": "Autenticacao necessaria"}), 401

        return redirect(url_for("auth.login", next=request.path))

    return wrapper
