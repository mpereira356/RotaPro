from flask import Blueprint, request, jsonify
from ..services.route_service import RouteService
from ..models import Route, Address, db
import time

api_bp = Blueprint('api', __name__)

@api_bp.route('/address-suggestions', methods=['GET'])
def address_suggestions():
    query = request.args.get('q', '').strip()
    lat = request.args.get('lat')
    lon = request.args.get('lon')

    if len(query) < 3:
        return jsonify({"suggestions": []})

    try:
        lat_value = float(lat) if lat is not None else None
        lon_value = float(lon) if lon is not None else None
    except ValueError:
        lat_value = None
        lon_value = None

    suggestions = RouteService.search_addresses(query, lat=lat_value, lon=lon_value, limit=6)
    return jsonify({"suggestions": suggestions})

@api_bp.route('/geocode', methods=['GET'])
def geocode_address():
    query = request.args.get('address', '').strip()

    if len(query) < 3:
        return jsonify({"error": "Endereco invalido"}), 400

    result = RouteService.geocode(query)
    if not result:
        return jsonify({"error": "Endereco nao localizado"}), 404

    return jsonify(result)

@api_bp.route('/optimize', methods=['POST'])
def optimize():
    data = request.json
    start_lat = data.get('lat')
    start_lon = data.get('lon')
    address_list = data.get('addresses', [])

    if start_lat is None or start_lon is None or not address_list:
        return jsonify({"error": "Dados incompletos"}), 400

    start_coords = {"lat": float(start_lat), "lon": float(start_lon)}
    
    # 1. Geocodificar endereços
    geocoded_locations = []
    for addr_str in address_list:
        if not addr_str.strip(): continue
        res = RouteService.geocode(addr_str)
        if res:
            geocoded_locations.append({
                "lat": res['lat'],
                "lon": res['lon'],
                "address": addr_str
            })
        # Pequena pausa para respeitar limites do Nominatim (1 req/sec recomendado)
        time.sleep(1)

    if not geocoded_locations:
        return jsonify({"error": "Nenhum endereço pôde ser localizado"}), 400

    # 2. Otimizar ordem (Nearest Neighbor)
    optimized_order = RouteService.optimize_route(start_coords, geocoded_locations)

    # 3. Obter rota detalhada via OSRM
    # Inclui o ponto inicial na rota para o OSRM
    points_for_osrm = [start_coords] + optimized_order
    route_data = RouteService.get_osrm_route(points_for_osrm)

    # 4. Salvar no banco de dados
    new_route = Route(
        total_distance=route_data['distance'] if route_data else 0,
        total_duration=route_data['duration'] if route_data else 0
    )
    db.session.add(new_route)
    db.session.flush()

    for i, loc in enumerate(optimized_order):
        addr = Address(
            route_id=new_route.id,
            raw_address=loc['address'],
            lat=loc['lat'],
            lon=loc['lon'],
            order=i + 1
        )
        db.session.add(addr)
    
    db.session.commit()

    return jsonify({
        "route_id": new_route.id,
        "optimized_order": optimized_order,
        "geometry": route_data['geometry'] if route_data else None,
        "distance": route_data['distance'] if route_data else 0,
        "duration": route_data['duration'] if route_data else 0
    })
