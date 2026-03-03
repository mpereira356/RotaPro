from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from .config import Config
from .auth_utils import load_current_user

db = SQLAlchemy()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

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
        
        app.register_blueprint(main_bp)
        app.register_blueprint(auth_bp)
        app.register_blueprint(api_bp, url_prefix='/api')
        
        db.create_all()

    return app
