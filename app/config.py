import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-key-route-optimizer'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///route_optimizer.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
