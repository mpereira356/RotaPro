// ============================================
// RouteOptimizer - Frontend Application
// ============================================

class RouteOptimizer {
    constructor() {
        this.map = null;
        this.currentLocation = null;
        this.markers = [];
        this.routePolyline = null;
        this.optimizedRoute = null;
        this.autocompleteTimer = null;
        this.resizeTimer = null;
        this.currentSuggestions = [];
        this.lastSuggestionQuery = '';
        this.addresses = [];

        this.initializeMap();
        this.attachEventListeners();
        this.attachViewportListeners();
        this.renderAddressItems();
    }

    // ============================================
    // Inicializacao do Mapa
    // ============================================
    initializeMap() {
        const defaultLat = -23.5505;
        const defaultLon = -46.6333;

        this.map = L.map('map').setView([defaultLat, defaultLon], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'OpenStreetMap contributors',
            maxZoom: 19,
        }).addTo(this.map);
    }

    attachEventListeners() {
        document.getElementById('btnGetLocation').addEventListener('click', () => this.getCurrentLocation());
        document.getElementById('btnCalculateRoute').addEventListener('click', () => this.calculateRoute());
        document.getElementById('btnClear').addEventListener('click', () => this.clearAll());
        document.getElementById('btnAddAddress').addEventListener('click', () => this.addAddressFromInput());
        document.getElementById('btnDownloadApk').addEventListener('click', (event) => this.handleApkDownload(event));

        const addressInput = document.getElementById('addressInput');
        addressInput.addEventListener('input', () => this.handleAddressInput());
        addressInput.addEventListener('keyup', () => this.handleAddressInput());
        addressInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.addAddressFromInput();
            }
        });
        addressInput.addEventListener('blur', () => {
            setTimeout(() => this.hideSuggestions(), 150);
        });
    }

    attachViewportListeners() {
        const refreshMapLayout = () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            }, 220);
        };

        window.addEventListener('resize', refreshMapLayout);
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            }, 320);
        });
    }

    async handleApkDownload(event) {
        event.preventDefault();
        const downloadUrl = '/download/android-apk';

        try {
            const response = await fetch(downloadUrl, { method: 'HEAD' });
            if (!response.ok) {
                this.showAlert('APK ainda nao disponivel. Gere e envie RouteOptimizer.apk para app/static/apk/.', 'warning');
                return;
            }
            window.location.href = downloadUrl;
        } catch (error) {
            console.error('Erro ao validar APK:', error);
            this.showAlert('Nao foi possivel validar o download do APK.', 'danger');
        }
    }

    // ============================================
    // Lista de Enderecos
    // ============================================
    addAddressFromInput() {
        const addressInput = document.getElementById('addressInput');
        const value = (addressInput.value || '').trim();

        if (!value) {
            this.showAlert('Digite um endereco antes de adicionar.', 'warning');
            return;
        }

        this.addresses.push(value);
        addressInput.value = '';
        this.hideSuggestions();
        this.lastSuggestionQuery = '';
        this.renderAddressItems();
    }

    removeAddress(index) {
        if (index < 0 || index >= this.addresses.length) {
            return;
        }
        this.addresses.splice(index, 1);
        this.renderAddressItems();
    }

    renderAddressItems() {
        const list = document.getElementById('addressItems');
        const count = document.getElementById('addressCount');
        const hiddenTextarea = document.getElementById('addressList');

        list.innerHTML = '';

        if (this.addresses.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'Nenhum endereco cadastrado.';
            list.appendChild(empty);
        } else {
            this.addresses.forEach((address, index) => {
                const item = document.createElement('div');
                item.className = 'address-item';
                item.innerHTML = `
                    <span><strong>${index + 1}.</strong> ${address}</span>
                    <button class="btn-remove-address" type="button" data-index="${index}" title="Remover">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                const btnRemove = item.querySelector('.btn-remove-address');
                btnRemove.addEventListener('click', () => this.removeAddress(index));
                list.appendChild(item);
            });
        }

        count.textContent = String(this.addresses.length);
        hiddenTextarea.value = this.addresses.join('\n');
    }

    // ============================================
    // Autocomplete de Enderecos
    // ============================================
    handleAddressInput() {
        const input = document.getElementById('addressInput');
        const query = (input.value || '').trim();

        if (query.length < 3) {
            this.hideSuggestions();
            this.lastSuggestionQuery = '';
            return;
        }

        if (query === this.lastSuggestionQuery) {
            return;
        }

        clearTimeout(this.autocompleteTimer);
        this.autocompleteTimer = setTimeout(() => {
            this.fetchAddressSuggestions(query);
        }, 500);
    }

    async fetchAddressSuggestions(query) {
        try {
            this.lastSuggestionQuery = query;
            const params = new URLSearchParams({ q: query });
            if (this.currentLocation) {
                params.set('lat', this.currentLocation.lat);
                params.set('lon', this.currentLocation.lon);
            }

            const response = await fetch(`/api/address-suggestions?${params.toString()}`);
            const data = await response.json();

            if (!response.ok || !data.suggestions || data.suggestions.length === 0) {
                this.hideSuggestions();
                return;
            }

            this.currentSuggestions = data.suggestions;
            this.renderSuggestions(data.suggestions);
        } catch (error) {
            console.error('Erro ao buscar sugestoes:', error);
            this.hideSuggestions();
        }
    }

    renderSuggestions(suggestions) {
        const suggestionsBox = document.getElementById('addressSuggestions');
        suggestionsBox.innerHTML = '';

        suggestions.forEach((suggestion) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'list-group-item list-group-item-action autocomplete-suggestion';
            item.innerHTML = `
                <div>${suggestion.label}</div>
                <div class="suggestion-meta">${suggestion.bairro || '-'} | ${suggestion.cidade || '-'}</div>
            `;

            item.addEventListener('mousedown', (event) => {
                event.preventDefault();
                this.applySuggestion(suggestion);
            });

            suggestionsBox.appendChild(item);
        });

        suggestionsBox.classList.remove('d-none');
    }

    applySuggestion(suggestion) {
        const input = document.getElementById('addressInput');
        const typedNumber = this.extractTypedNumber(input.value || '');
        input.value = this.buildSuggestionText(suggestion, typedNumber);
        input.focus();
        this.hideSuggestions();
    }

    extractTypedNumber(text) {
        const value = (text || '').trim();
        if (!value) {
            return '';
        }

        // Captura numero apos virgula: "Rua X, 123"
        const commaMatch = value.match(/,\s*(\d+[a-zA-Z0-9/-]*)\b/);
        if (commaMatch) {
            return commaMatch[1];
        }

        // Captura padrao "n 123" ou "n. 123"
        const nMatch = value.match(/\bn\.?\s*(\d+[a-zA-Z0-9/-]*)\b/i);
        if (nMatch) {
            return nMatch[1];
        }

        // Fallback: ultimo token numerico do texto.
        const endMatch = value.match(/(\d+[a-zA-Z0-9/-]*)\s*$/);
        return endMatch ? endMatch[1] : '';
    }

    buildSuggestionText(suggestion, typedNumber = '') {
        const road = suggestion.road || '';
        const bairro = suggestion.bairro || '';
        const cidade = suggestion.cidade || '';
        const number = typedNumber || suggestion.house_number || '';

        if (!road) {
            return suggestion.label || suggestion.display_name || '';
        }

        const parts = [];
        parts.push(number ? `${road}, ${number}` : road);
        if (bairro) {
            parts.push(bairro);
        }
        if (cidade) {
            parts.push(cidade);
        }
        return parts.join(' - ');
    }

    hideSuggestions() {
        const suggestionsBox = document.getElementById('addressSuggestions');
        suggestionsBox.classList.add('d-none');
        suggestionsBox.innerHTML = '';
        this.currentSuggestions = [];
    }

    // ============================================
    // Geolocalizacao
    // ============================================
    getCurrentLocation() {
        const btn = document.getElementById('btnGetLocation');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Detectando...';

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentLocation = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };

                    document.getElementById('currentLocation').value =
                        `${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lon.toFixed(4)}`;
                    document.getElementById('coordsDisplay').textContent =
                        `Latitude: ${this.currentLocation.lat.toFixed(6)}, Longitude: ${this.currentLocation.lon.toFixed(6)}`;

                    this.map.setView([this.currentLocation.lat, this.currentLocation.lon], 15);

                    this.clearMarkers();
                    const currentMarker = L.circleMarker(
                        [this.currentLocation.lat, this.currentLocation.lon],
                        {
                            radius: 10,
                            fillColor: '#1f3a5f',
                            color: '#fff',
                            weight: 3,
                            opacity: 1,
                            fillOpacity: 0.9
                        }
                    ).addTo(this.map);

                    currentMarker.bindPopup('Sua localizacao atual').openPopup();
                    this.markers.push(currentMarker);

                    this.showAlert('Localizacao detectada com sucesso!', 'success');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-location-crosshairs"></i> Detectar';
                },
                (error) => {
                    console.error('Erro ao obter localizacao:', error);
                    this.showAlert('Erro ao obter localizacao. Verifique permissoes do navegador.', 'danger');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-location-crosshairs"></i> Detectar';
                }
            );
        } else {
            this.showAlert('Geolocalizacao nao e suportada neste navegador.', 'danger');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-location-crosshairs"></i> Detectar';
        }
    }

    // ============================================
    // Calculo de Rota
    // ============================================
    async calculateRoute() {
        if (!this.currentLocation) {
            this.showAlert('Detecte sua localizacao primeiro.', 'warning');
            return;
        }

        if (this.addresses.length === 0) {
            this.showAlert('Adicione pelo menos um endereco usando o botao +.', 'warning');
            return;
        }

        const btn = document.getElementById('btnCalculateRoute');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Calculando...';

        try {
            const response = await fetch('/api/optimize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    lat: this.currentLocation.lat,
                    lon: this.currentLocation.lon,
                    addresses: this.addresses
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erro ao calcular rota');
            }

            this.optimizedRoute = data;
            this.displayResults(data);
            this.displayMapRoute(data);
            this.showAlert('Rota otimizada com sucesso!', 'success');

        } catch (error) {
            console.error('Erro:', error);
            this.showAlert(`Erro: ${error.message}`, 'danger');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-calculator"></i> Calcular Melhor Rota';
        }
    }

    // ============================================
    // Exibicao de Resultados
    // ============================================
    displayResults(data) {
        const resultsCard = document.getElementById('resultsCard');
        const routeList = document.getElementById('routeList');
        const totalDistance = document.getElementById('totalDistance');
        const totalDuration = document.getElementById('totalDuration');

        const distanceKm = (data.distance / 1000).toFixed(2);
        const durationMin = Math.round(data.duration / 60);

        totalDistance.textContent = distanceKm;
        totalDuration.textContent = durationMin;

        routeList.innerHTML = '';
        data.optimized_order.forEach((location, index) => {
            const googleMapsUrl = this.buildGoogleMapsUrl(location.lat, location.lon);
            const wazeUrl = this.buildWazeUrl(location.lat, location.lon);
            const item = document.createElement('div');
            item.className = 'list-group-item';
            item.innerHTML = `
                <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                    <div>
                        <h6 class="mb-1">
                            <span class="badge bg-primary me-2">${index + 1}</span>
                            ${location.address}
                        </h6>
                        <small class="text-muted">
                            <i class="fas fa-map-pin"></i>
                            ${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}
                        </small>
                    </div>
                    <div class="route-actions">
                        <a class="btn btn-outline-success btn-sm route-nav-btn" href="${wazeUrl}" target="_blank" rel="noopener noreferrer">
                            <i class="fas fa-location-arrow"></i> Waze
                        </a>
                        <a class="btn btn-outline-primary btn-sm route-nav-btn" href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer">
                            <i class="fas fa-map-marked-alt"></i> Google Maps
                        </a>
                    </div>
                </div>
            `;
            routeList.appendChild(item);
        });

        resultsCard.style.display = 'block';
    }

    buildWazeUrl(lat, lon) {
        return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
    }

    buildGoogleMapsUrl(lat, lon) {
        return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
    }

    displayMapRoute(data) {
        this.clearMarkers();
        this.clearPolyline();

        const currentMarker = L.circleMarker(
            [this.currentLocation.lat, this.currentLocation.lon],
            {
                radius: 10,
                fillColor: '#1f3a5f',
                color: '#fff',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.9
            }
        ).addTo(this.map);
        currentMarker.bindPopup('Inicio da rota');
        this.markers.push(currentMarker);

        data.optimized_order.forEach((location, index) => {
            const marker = L.marker(
                [location.lat, location.lon],
                {
                    icon: this.createNumberIcon(index + 1)
                }
            ).addTo(this.map);

            marker.bindPopup(`
                <strong>${index + 1}. ${location.address}</strong><br>
                <small>${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}</small>
            `);

            this.markers.push(marker);
        });

        if (data.geometry && data.geometry.coordinates) {
            const coordinates = data.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            this.routePolyline = L.polyline(coordinates, {
                color: '#1f3a5f',
                weight: 4,
                opacity: 0.78,
                dashArray: '6, 6'
            }).addTo(this.map);
        } else {
            const points = [this.currentLocation, ...data.optimized_order];
            const coordinates = points.map(p => [p.lat, p.lon]);
            this.routePolyline = L.polyline(coordinates, {
                color: '#f39c12',
                weight: 4,
                opacity: 0.82
            }).addTo(this.map);
        }

        const group = new L.featureGroup(this.markers);
        this.map.fitBounds(group.getBounds().pad(0.1));
        this.map.invalidateSize();
    }

    createNumberIcon(number) {
        const html = `
            <div style="
                background: linear-gradient(135deg, #f39c12 0%, #cf7e0a 100%);
                color: white;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 16px;
                border: 3px solid white;
                box-shadow: 0 2px 5px rgba(0,0,0,0.32);
            ">
                ${number}
            </div>
        `;

        return L.divIcon({
            html: html,
            iconSize: [40, 40],
            className: 'number-icon'
        });
    }

    // ============================================
    // Utilitarios
    // ============================================
    showAlert(message, type = 'info') {
        const alertDiv = document.getElementById('statusAlert');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        alertDiv.classList.remove('d-none');

        setTimeout(() => {
            alertDiv.classList.add('d-none');
        }, 4500);
    }

    clearMarkers() {
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];
    }

    clearPolyline() {
        if (this.routePolyline) {
            this.map.removeLayer(this.routePolyline);
            this.routePolyline = null;
        }
    }

    clearAll() {
        document.getElementById('addressInput').value = '';
        document.getElementById('addressList').value = '';
        document.getElementById('currentLocation').value = '';
        document.getElementById('coordsDisplay').textContent = 'Clique em "Detectar" para obter suas coordenadas';
        document.getElementById('resultsCard').style.display = 'none';

        this.currentLocation = null;
        this.optimizedRoute = null;
        this.addresses = [];

        this.clearMarkers();
        this.clearPolyline();
        this.hideSuggestions();
        this.lastSuggestionQuery = '';

        this.renderAddressItems();
        this.map.setView([-23.5505, -46.6333], 13);
        this.map.invalidateSize();
        this.showAlert('Tudo limpo.', 'info');
    }
}

// ============================================
// Inicializar aplicacao quando DOM estiver pronto
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    window.routeOptimizer = new RouteOptimizer();
});
