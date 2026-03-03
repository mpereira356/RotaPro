from flask import Blueprint, flash, g, redirect, render_template, request, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from .. import db
from ..auth_utils import login_user, logout_user
from ..models import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if g.get("current_user"):
        return redirect(url_for("main.app_page"))

    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("password") or ""
        next_url = request.args.get("next") or url_for("main.app_page")

        user = User.query.filter_by(email=email).first()
        if not user or not check_password_hash(user.password_hash, password):
            flash("Email ou senha invalidos.", "danger")
            return render_template("auth/login.html")

        login_user(user)
        return redirect(next_url)

    return render_template("auth/login.html")


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if g.get("current_user"):
        return redirect(url_for("main.app_page"))

    if request.method == "POST":
        name = (request.form.get("name") or "").strip()
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("password") or ""
        confirm = request.form.get("confirm_password") or ""

        if len(name) < 2:
            flash("Informe um nome valido.", "warning")
            return render_template("auth/register.html")
        if "@" not in email or len(email) < 6:
            flash("Informe um email valido.", "warning")
            return render_template("auth/register.html")
        if len(password) < 6:
            flash("A senha precisa ter no minimo 6 caracteres.", "warning")
            return render_template("auth/register.html")
        if password != confirm:
            flash("As senhas nao conferem.", "warning")
            return render_template("auth/register.html")

        if User.query.filter_by(email=email).first():
            flash("Ja existe uma conta com esse email.", "warning")
            return render_template("auth/register.html")

        user = User(name=name, email=email, password_hash=generate_password_hash(password))
        db.session.add(user)
        db.session.commit()

        login_user(user)
        return redirect(url_for("main.app_page"))

    return render_template("auth/register.html")


@auth_bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return redirect(url_for("main.home"))
