from flask import Blueprint, flash, g, redirect, render_template, request, url_for
from sqlalchemy import func

from .. import db
from ..auth_utils import admin_required
from ..models import Address, Route, User

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
            Route.created_at,
            Route.total_distance,
            Route.total_duration,
            func.coalesce(route_counts.c.count, 0).label("stops"),
        )
        .outerjoin(route_counts, route_counts.c.route_id == Route.id)
        .order_by(Route.created_at.desc())
        .limit(80)
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


@admin_bp.route("/routes/<int:route_id>/delete", methods=["POST"])
@admin_required
def delete_route(route_id):
    route = Route.query.get_or_404(route_id)
    Address.query.filter_by(route_id=route.id).delete()
    db.session.delete(route)
    db.session.commit()
    flash(f"Rota #{route_id} removida com sucesso.", "success")
    return redirect(url_for("admin.dashboard"))
