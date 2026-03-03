from flask import Blueprint, flash, g, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from .. import db
from ..auth_utils import login_required, login_user, logout_user
from ..models import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if g.get("current_user"):
        return redirect(url_for("main.app_page"))

    if request.method == "POST":
        username = (request.form.get("username") or "").strip().lower()
        password = request.form.get("password") or ""
        remember_me = request.form.get("remember_me") == "on"
        next_url = request.args.get("next") or url_for("main.app_page")

        user = User.query.filter_by(username=username).first()
        if not user or not check_password_hash(user.password_hash, password):
            flash("Usuario ou senha invalidos.", "danger")
            return render_template("auth/login.html", remember_me=remember_me)
        if not user.is_active:
            flash("Conta desativada. Fale com o administrador.", "warning")
            return render_template("auth/login.html", remember_me=remember_me)

        if username == "admin" and not user.is_admin:
            user.is_admin = True
            db.session.commit()

        session.permanent = remember_me
        login_user(user)
        return redirect(next_url)

    return render_template("auth/login.html", remember_me=True)


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if g.get("current_user"):
        return redirect(url_for("main.app_page"))

    if request.method == "POST":
        username = (request.form.get("username") or "").strip().lower()
        name = (request.form.get("name") or "").strip()
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("password") or ""
        confirm = request.form.get("confirm_password") or ""

        if len(username) < 3:
            flash("Informe um usuario com no minimo 3 caracteres.", "warning")
            return render_template("auth/register.html")
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

        if User.query.filter_by(username=username).first():
            flash("Ja existe uma conta com esse usuario.", "warning")
            return render_template("auth/register.html")
        if User.query.filter_by(email=email).first():
            flash("Ja existe uma conta com esse email.", "warning")
            return render_template("auth/register.html")

        user = User(
            username=username,
            name=name,
            email=email,
            password_hash=generate_password_hash(password),
            is_active=True,
            is_admin=(username == "admin"),
        )
        db.session.add(user)
        db.session.commit()

        login_user(user)
        return redirect(url_for("main.app_page"))

    return render_template("auth/register.html")


@auth_bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return redirect(url_for("main.home"))


@auth_bp.route("/change-password", methods=["POST"])
@login_required
def change_password():
    current_password = request.form.get("current_password") or ""
    new_password = request.form.get("new_password") or ""
    confirm_password = request.form.get("confirm_password") or ""

    user = g.get("current_user")
    if not user:
        return jsonify({"error": "Autenticacao necessaria"}), 401

    if not check_password_hash(user.password_hash, current_password):
        return jsonify({"error": "Senha atual incorreta."}), 400

    if len(new_password) < 6:
        return jsonify({"error": "A nova senha precisa ter no minimo 6 caracteres."}), 400

    if new_password != confirm_password:
        return jsonify({"error": "As senhas nao conferem."}), 400

    if check_password_hash(user.password_hash, new_password):
        return jsonify({"error": "A nova senha deve ser diferente da senha atual."}), 400

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({"message": "Senha alterada com sucesso."})
