import math
import requests


class RouteService:
    @staticmethod
    def _build_viewbox(lat, lon, delta=0.25):
        left = lon - delta
        right = lon + delta
        top = lat + delta
        bottom = lat - delta
        return f"{left},{top},{right},{bottom}"

    @staticmethod
    def _parse_nominatim_results(data):
        results = []

        for item in data:
            addr = item.get("address", {})
            bairro = addr.get("suburb") or addr.get("neighbourhood") or addr.get("quarter") or ""
            cidade = addr.get("city") or addr.get("town") or addr.get("municipality") or ""

            short_parts = []
            road = addr.get("road")
            house_number = addr.get("house_number")
            if road:
                short_parts.append(f"{road}, {house_number}" if house_number else road)
            if bairro:
                short_parts.append(bairro)
            if cidade:
                short_parts.append(cidade)

            short_address = " - ".join(short_parts) if short_parts else item.get("display_name", "")
            results.append({
                "label": short_address,
                "display_name": item.get("display_name", ""),
                "road": road or "",
                "house_number": house_number or "",
                "bairro": bairro,
                "cidade": cidade,
                "lat": float(item["lat"]),
                "lon": float(item["lon"])
            })

        return results

    @staticmethod
    def search_addresses(query, lat=None, lon=None, limit=5):
        """Busca opcoes de endereco com detalhes de bairro/cidade via Nominatim."""
        if not query or len(query.strip()) < 3:
            return []

        base_url = "https://nominatim.openstreetmap.org/search"
        base_params = {
            "q": query.strip(),
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": max(1, min(limit, 8)),
            "countrycodes": "br",
            "dedupe": 1
        }

        headers = {
            "User-Agent": "RouteOptimizerApp/1.0"
        }

        try:
            # 1) Busca com foco na regiao atual (quando houver localizacao).
            params = dict(base_params)
            if lat is not None and lon is not None:
                params["viewbox"] = RouteService._build_viewbox(float(lat), float(lon))
                params["bounded"] = 1

            response = requests.get(base_url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json() or []
            results = RouteService._parse_nominatim_results(data)

            # 2) Fallback sem restricao geografica se vier vazio.
            if not results and lat is not None and lon is not None:
                response = requests.get(base_url, params=base_params, headers=headers, timeout=10)
                response.raise_for_status()
                data = response.json() or []
                results = RouteService._parse_nominatim_results(data)

            return results
        except Exception as e:
            print(f"Erro na busca de sugestoes: {e}")
            return []

    @staticmethod
    def geocode(address):
        """Converte endereco em coordenadas usando Nominatim."""
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": address,
            "format": "json",
            "addressdetails": 1,
            "countrycodes": "br",
            "limit": 1
        }
        headers = {
            "User-Agent": "RouteOptimizerApp/1.0"
        }
        try:
            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            if data:
                return {
                    "lat": float(data[0]["lat"]),
                    "lon": float(data[0]["lon"]),
                    "display_name": data[0]["display_name"]
                }
        except Exception as e:
            print(f"Erro no geocoding: {e}")
        return None

    @staticmethod
    def calculate_distance(lat1, lon1, lat2, lon2):
        """Calculo simples de distancia Haversine para o algoritmo Nearest Neighbor."""
        radius_earth_km = 6371
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return radius_earth_km * c

    @staticmethod
    def optimize_route(start_coords, locations):
        """
        Implementa o algoritmo Nearest Neighbor.
        locations: lista de dicts com {'lat', 'lon', 'address'}.
        """
        optimized = []
        current_pos = start_coords
        unvisited = locations.copy()

        while unvisited:
            nearest = min(unvisited, key=lambda x: RouteService.calculate_distance(
                current_pos["lat"], current_pos["lon"], x["lat"], x["lon"]
            ))
            optimized.append(nearest)
            current_pos = nearest
            unvisited.remove(nearest)

        return optimized

    @staticmethod
    def get_osrm_route(points):
        """Obtem a rota real (caminhos de rua) via OSRM."""
        coords_str = ";".join([f"{p['lon']},{p['lat']}" for p in points])
        url = f"http://router.project-osrm.org/route/v1/driving/{coords_str}?overview=full&geometries=geojson"

        try:
            response = requests.get(url, timeout=15)
            response.raise_for_status()
            data = response.json()
            if data["code"] == "Ok":
                route = data["routes"][0]
                return {
                    "geometry": route["geometry"],
                    "distance": route["distance"],
                    "duration": route["duration"]
                }
        except Exception as e:
            print(f"Erro no OSRM: {e}")
        return None
