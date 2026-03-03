from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from .config import Config

db = SQLAlchemy()


def _ensure_user_columns():
    with db.engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(user)"))}

        if "username" not in columns:
            conn.execute(text("ALTER TABLE user ADD COLUMN username VARCHAR(80)"))
        if "is_active" not in columns:
            conn.execute(text("ALTER TABLE user ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"))
        if "is_admin" not in columns:
            conn.execute(text("ALTER TABLE user ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))

        rows = conn.execute(text("SELECT id, name, email, username FROM user")).fetchall()
        used = set()
        for row in rows:
            candidate = (row.username or "").strip().lower()
            if not candidate:
                base = (row.name or "").strip().lower().replace(" ", "")
                if not base:
                    base = (row.email or "").split("@")[0].strip().lower() or f"user{row.id}"
                candidate = base

            username = candidate
            suffix = 1
            while username in used:
                username = f"{candidate}{suffix}"
                suffix += 1

            used.add(username)
            conn.execute(
                text("UPDATE user SET username = :username WHERE id = :id"),
                {"username": username, "id": row.id},
            )

        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_username ON user (username)"))
        conn.execute(text("UPDATE user SET is_active = 1 WHERE is_active IS NULL"))
        conn.execute(text("UPDATE user SET is_admin = 0 WHERE is_admin IS NULL"))
        conn.execute(
            text(
                "UPDATE user SET is_admin = 1 WHERE lower(username) = 'admin' OR lower(email) = 'admin' OR lower(name) = 'admin'"
            )
        )


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    from .auth_utils import load_current_user

    db.init_app(app)

    @app.before_request
    def _load_current_user():
        load_current_user()

    @app.context_processor
    def inject_current_user():
        from flask import g
        return {"current_user": g.get("current_user")}

    with app.app_context():
        from .blueprints.main import main_bp
        from .blueprints.api import api_bp
        from .blueprints.auth import auth_bp
        from .blueprints.admin import admin_bp
        
        app.register_blueprint(main_bp)
        app.register_blueprint(auth_bp)
        app.register_blueprint(admin_bp)
        app.register_blueprint(api_bp, url_prefix='/api')

        db.create_all()
        _ensure_user_columns()

    return app
