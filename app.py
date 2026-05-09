"""
app.py — Entry point
--------------------
Creates the Flask app and registers all route blueprints.
Run this file to start the server.
"""

import os
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()

from flask import Flask
from flask_session import Session
from routes.interview import interview_bp
from routes.pages import pages_bp


def create_app():
    app = Flask(__name__)
    app.secret_key = os.environ.get("SECRET_KEY", "mock-interviewer-secret-2024")

    # ── Server-side session (filesystem) ─────────────────────────────────────
    app.config["SESSION_TYPE"] = "filesystem"
    app.config["SESSION_FILE_DIR"] = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "flask_sessions"
    )
    app.config["SESSION_PERMANENT"] = True
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)
    app.config["SESSION_FILE_THRESHOLD"] = 100
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    Session(app)

    # Register route blueprints
    app.register_blueprint(pages_bp)
    app.register_blueprint(interview_bp)

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
