from pathlib import Path

from flask import Blueprint, current_app, jsonify, render_template, send_from_directory
from ..auth_utils import premium_required

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def home():
    return render_template('landing.html')


@main_bp.route('/app')
@premium_required
def app_page():
    return render_template('index.html')


@main_bp.route('/download/android-apk', methods=['GET'])
def download_android_apk():
    apk_filename = 'RouteOptimizer.apk'
    apk_dir = Path(current_app.static_folder) / 'apk'
    apk_path = apk_dir / apk_filename

    if not apk_path.exists():
        return jsonify({
            "error": "APK nao disponivel no momento",
            "expected_path": f"app/static/apk/{apk_filename}"
        }), 404

    return send_from_directory(
        directory=str(apk_dir),
        path=apk_filename,
        as_attachment=True,
        download_name=apk_filename
    )
