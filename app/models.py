from . import db
from datetime import datetime

class Route(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    total_distance = db.Column(db.Float) # em metros
    total_duration = db.Column(db.Float) # em segundos
    addresses = db.relationship('Address', backref='route', lazy=True)

class Address(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    route_id = db.Column(db.Integer, db.ForeignKey('route.id'), nullable=False)
    raw_address = db.Column(db.String(500), nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)
    order = db.Column(db.Integer, nullable=False)
