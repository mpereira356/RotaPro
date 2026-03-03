import math
import requests
import re
import unicodedata


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
        if lat is None or lon is None:
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
            params = dict(base_params)
            params["viewbox"] = RouteService._build_viewbox(float(lat), float(lon))
            params["bounded"] = 1

            response = requests.get(base_url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json() or []
            results = RouteService._parse_nominatim_results(data)

            return results
        except Exception as e:
            print(f"Erro na busca de sugestoes: {e}")
            return []

    @staticmethod
    def geocode(address, lat=None, lon=None):
        """Converte endereco em coordenadas usando Nominatim com tentativas de fallback."""
        return RouteService._geocode_with_fallback(address, lat=lat, lon=lon)

    @staticmethod
    def _strip_accents(text):
        normalized = unicodedata.normalize("NFKD", text)
        return "".join(ch for ch in normalized if not unicodedata.combining(ch))

    @staticmethod
    def _normalize_address_text(address):
        text = (address or "").strip()
        if not text:
            return ""

        text = text.replace("–", ", ").replace("—", ", ").replace("−", ", ")
        text = text.replace("’", "'").replace("`", "'")
        text = re.sub(r"\s*[,;]\s*", ", ", text)
        text = re.sub(r"\s+", " ", text).strip(" ,")
        return text

    @staticmethod
    def _build_geocode_candidates(address):
        normalized = RouteService._normalize_address_text(address)
        if not normalized:
            return []

        candidates = [normalized]

        compact_match = re.match(r"^\s*([^,]+),\s*([0-9A-Za-z/-]+)", normalized)
        if compact_match:
            street = compact_match.group(1).strip()
            number = compact_match.group(2).strip()
            candidates.append(f"{street}, {number}, Sao Paulo, SP, Brasil")

        parts = [p.strip() for p in normalized.split(",") if p.strip()]
        if len(parts) >= 2:
            candidates.append(f"{parts[0]}, {parts[1]}, Sao Paulo, SP, Brasil")

        candidates.append(RouteService._strip_accents(normalized))

        unique = []
        seen = set()
        for query in candidates:
            key = query.lower()
            if query and key not in seen:
                seen.add(key)
                unique.append(query)
        return unique

    @staticmethod
    def _geocode_once(query, lat=None, lon=None, bounded=False):
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "countrycodes": "br",
            "limit": 1
        }
        if lat is not None and lon is not None:
            params["viewbox"] = RouteService._build_viewbox(float(lat), float(lon), delta=0.7)
            if bounded:
                params["bounded"] = 1

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
    def _geocode_with_fallback(address, lat=None, lon=None):
        for query in RouteService._build_geocode_candidates(address):
            if lat is not None and lon is not None:
                result = RouteService._geocode_once(query, lat=lat, lon=lon, bounded=True)
                if result:
                    return result

            result = RouteService._geocode_once(query, lat=lat, lon=lon, bounded=False)
            if result:
                return result
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
