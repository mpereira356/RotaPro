from flask import Blueprint, flash, g, redirect, render_template, request, url_for
from sqlalchemy import func
from werkzeug.security import generate_password_hash

from .. import db
from ..auth_utils import admin_required
from ..models import Address, LoginEvent, Route, User

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


@admin_bp.route("")
@admin_required
def dashboard():
    if User.query.filter_by(is_admin=True).count() == 0:
        g.current_user.is_admin = True
        db.session.commit()
        flash("Seu usuario foi promovido a administrador inicial.", "success")

    total_users = User.query.count()
    active_users = User.query.filter_by(is_active=True).count()
    admin_users = User.query.filter_by(is_admin=True).count()
    premium_users = User.query.filter_by(is_premium=True).count()
    total_routes = Route.query.count()

    avg_distance = db.session.query(func.avg(Route.total_distance)).scalar() or 0
    avg_duration = db.session.query(func.avg(Route.total_duration)).scalar() or 0

    users = User.query.order_by(User.created_at.desc()).limit(120).all()

    route_counts = (
        db.session.query(Address.route_id, func.count(Address.id).label("count"))
        .group_by(Address.route_id)
        .subquery()
    )

    recent_routes = (
        db.session.query(
            Route.id,
            Route.user_id,
            Route.created_at,
            Route.total_distance,
            Route.total_duration,
            func.coalesce(route_counts.c.count, 0).label("stops"),
            User.username.label("username"),
            User.name.label("user_name"),
            User.email.label("user_email"),
            User.is_premium.label("is_premium"),
        )
        .outerjoin(User, User.id == Route.user_id)
        .outerjoin(route_counts, route_counts.c.route_id == Route.id)
        .order_by(Route.created_at.desc())
        .limit(80)
        .all()
    )

    recent_login_events = (
        db.session.query(
            LoginEvent.id,
            LoginEvent.created_at,
            LoginEvent.username,
            LoginEvent.success,
            LoginEvent.reason,
            LoginEvent.ip_address,
            LoginEvent.user_agent,
            User.username.label("resolved_username"),
            User.name.label("resolved_name"),
        )
        .outerjoin(User, User.id == LoginEvent.user_id)
        .order_by(LoginEvent.created_at.desc())
        .limit(120)
        .all()
    )

    return render_template(
        "admin/dashboard.html",
        total_users=total_users,
        active_users=active_users,
        admin_users=admin_users,
        premium_users=premium_users,
        total_routes=total_routes,
        avg_distance=avg_distance,
        avg_duration=avg_duration,
        users=users,
        recent_routes=recent_routes,
        recent_login_events=recent_login_events,
    )


@admin_bp.route("/users/<int:user_id>/toggle-active", methods=["POST"])
@admin_required
def toggle_user_active(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == g.current_user.id:
        flash("Nao e permitido desativar sua propria conta.", "warning")
        return redirect(url_for("admin.dashboard"))

    user.is_active = not user.is_active
    db.session.commit()
    flash(f"Usuario {user.email} {'ativado' if user.is_active else 'desativado'}.", "success")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/users/<int:user_id>/toggle-admin", methods=["POST"])
@admin_required
def toggle_user_admin(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == g.current_user.id and user.is_admin:
        flash("Nao e permitido remover seu proprio perfil admin.", "warning")
        return redirect(url_for("admin.dashboard"))

    user.is_admin = not user.is_admin
    db.session.commit()
    flash(f"Permissao admin de {user.email} {'ativada' if user.is_admin else 'removida'}.", "success")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/users/<int:user_id>/toggle-premium", methods=["POST"])
@admin_required
def toggle_user_premium(user_id):
    user = User.query.get_or_404(user_id)
    user.is_premium = not user.is_premium
    db.session.commit()
    flash(f"Premium de {user.username} {'ativado' if user.is_premium else 'removido'}.", "success")
    return redirect(url_for("admin.dashboard"))


@admin_bp.route("/users/<int:user_id>/edit", methods=["GET", "POST"])
@admin_required
def edit_user(user_id):
    user = User.query.get_or_404(user_id)

    if request.method == "POST":
        username = (request.form.get("username") or "").strip().lower()
        name = (request.form.get("name") or "").strip()
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("new_password") or ""
        is_active = request.form.get("is_active") == "on"
        is_admin = request.form.get("is_admin") == "on"
        is_premium = request.form.get("is_premium") == "on"

        if user.id == g.current_user.id and not is_active:
            flash("Nao e permitido desativar seu proprio usuario.", "warning")
            return redirect(url_for("admin.edit_user", user_id=user.id))
        if user.id == g.current_user.id and not is_admin:
            flash("Nao e permitido remover seu proprio admin.", "warning")
            return redirect(url_for("admin.edit_user", user_id=user.id))

        if len(username) < 3:
            flash("Usuario deve ter no minimo 3 caracteres.", "warning")
            return redirect(url_for("admin.edit_user", user_id=user.id))
        if len(name) < 2:
            flash("Nome invalido.", "warning")
            return redirect(url_for("admin.edit_user", user_id=user.id))
        if "@" not in email or len(email) < 6:
            flash("Email invalido.", "warning")
            return redirect(url_for("admin.edit_user", user_id=user.id))

        existing_by_username = User.query.filter(User.username == username, User.id != user.id).first()
        if existing_by_username:
            flash("Ja existe outro usuario com esse username.", "warning")
            return redirect(url_for("admin.edit_user", user_id=user.id))

        existing_by_email = User.query.filter(User.email == email, User.id != user.id).first()
        if existing_by_email:
            flash("Ja existe outro usuario com esse email.", "warning")
            return redirect(url_for("admin.edit_user", user_id=user.id))

        user.username = username
        user.name = name
        user.email = email
        user.is_active = is_active
        user.is_admin = is_admin
        user.is_premium = is_premium

        if password:
            if len(password) < 6:
                flash("Nova senha deve ter no minimo 6 caracteres.", "warning")
                return redirect(url_for("admin.edit_user", user_id=user.id))
            user.password_hash = generate_password_hash(password)

        db.session.commit()
        flash(f"Usuario {user.username} atualizado com sucesso.", "success")
        return redirect(url_for("admin.dashboard"))

    return render_template("admin/edit_user.html", user=user)


@admin_bp.route("/routes/<int:route_id>/delete", methods=["POST"])
@admin_required
def delete_route(route_id):
    route = Route.query.get_or_404(route_id)
    Address.query.filter_by(route_id=route.id).delete()
    db.session.delete(route)
    db.session.commit()
    flash(f"Rota #{route_id} removida com sucesso.", "success")
    return redirect(url_for("admin.dashboard"))
