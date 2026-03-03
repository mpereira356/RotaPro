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
        this.currentLocationLookupTimer = null;
        this.currentSuggestions = [];
        this.lastSuggestionQuery = '';
        this.addresses = [];

        this.initializeMap();
        this.adjustUiForEmbeddedApp();
        this.attachEventListeners();
        this.attachViewportListeners();
        this.renderAddressItems();
    }

    adjustUiForEmbeddedApp() {
        const btnDownloadApk = document.getElementById('btnDownloadApk');
        if (!btnDownloadApk) {
            return;
        }

        const userAgent = (navigator.userAgent || '').toLowerCase();
        const isAndroidEmbeddedApp = userAgent.includes('routeoptimizerandroidapp');
        if (isAndroidEmbeddedApp) {
            btnDownloadApk.classList.add('d-none');
        }
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
        document.getElementById('btnMapLocate').addEventListener('click', () => this.getCurrentLocation());
        document.getElementById('btnZoomIn').addEventListener('click', () => this.map.zoomIn());
        document.getElementById('btnZoomOut').addEventListener('click', () => this.map.zoomOut());
        document.getElementById('btnCalculateRoute').addEventListener('click', () => this.calculateRoute());
        document.getElementById('btnClear').addEventListener('click', () => this.clearAll());
        document.getElementById('btnAddAddress').addEventListener('click', () => this.addAddressFromInput());
        document.getElementById('btnAddAddressList').addEventListener('click', () => this.addAddressListFromInput());
        document.getElementById('btnOpenWazeSequence').addEventListener('click', () => this.openWazeSequence());
        document.getElementById('btnOpenGoogleSequence').addEventListener('click', () => this.openGoogleSequence());
        document.getElementById('btnDownloadApk').addEventListener('click', (event) => this.handleApkDownload(event));
        document.getElementById('currentLocation').addEventListener('input', () => {
            // Se o usuario editar a origem, invalida coordenadas anteriores para recalcular.
            this.currentLocation = null;
            this.scheduleCurrentLocationPreview();
        });
        document.getElementById('currentLocation').addEventListener('blur', () => this.previewCurrentLocation());
        document.getElementById('currentLocation').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.previewCurrentLocation();
            }
        });

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
    splitAddresses(rawText) {
        return (rawText || '')
            .split(/\r?\n|;/)
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }

    addAddresses(entries) {
        if (!entries || entries.length === 0) {
            return 0;
        }

        let added = 0;
        entries.forEach((entry) => {
            if (!this.addresses.includes(entry)) {
                this.addresses.push(entry);
                added += 1;
            }
        });

        this.renderAddressItems();
        return added;
    }

    addAddressFromInput() {
        const addressInput = document.getElementById('addressInput');
        const value = (addressInput.value || '').trim();

        if (!value) {
            this.showAlert('Digite um endereco antes de adicionar.', 'warning');
            return;
        }

        const added = this.addAddresses([value]);
        if (added === 0) {
            this.showAlert('Esse endereco ja foi adicionado.', 'info');
            return;
        }

        addressInput.value = '';
        this.hideSuggestions();
        this.lastSuggestionQuery = '';
    }

    addAddressListFromInput() {
        const bulkInput = document.getElementById('addressBulkInput');
        const entries = this.splitAddresses(bulkInput.value || '');

        if (entries.length === 0) {
            this.showAlert('Cole uma lista valida (uma linha por endereco).', 'warning');
            return;
        }

        const added = this.addAddresses(entries);
        bulkInput.value = '';

        if (added === 0) {
            this.showAlert('Nenhum novo endereco foi adicionado (todos ja existem).', 'info');
            return;
        }

        this.showAlert(`${added} endereco(s) adicionado(s) com sucesso!`, 'success');
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
                const [titlePart, ...rest] = address.split(' - ');
                const subtitlePart = rest.length > 0 ? rest.join(' - ') : 'Sao Paulo';
                const item = document.createElement('div');
                item.className = 'address-item';
                item.innerHTML = `
                    <i class="fas fa-location-dot address-icon"></i>
                    <div class="address-item-main">
                        <div class="address-title">${index + 1}. ${titlePart}</div>
                        <div class="address-subtitle">${subtitlePart}</div>
                    </div>
                    <i class="fas fa-grip-lines address-drag" aria-hidden="true"></i>
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

        if (!this.currentLocation) {
            this.hideSuggestions();
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
    scheduleCurrentLocationPreview() {
        clearTimeout(this.currentLocationLookupTimer);
        this.currentLocationLookupTimer = setTimeout(() => {
            this.previewCurrentLocation();
        }, 700);
    }

    async previewCurrentLocation() {
        const currentLocationInput = document.getElementById('currentLocation');
        const typedOrigin = (currentLocationInput.value || '').trim();
        const coordsDisplay = document.getElementById('coordsDisplay');

        if (!typedOrigin) {
            coordsDisplay.textContent = 'Digite sua origem manualmente ou clique em "Detectar"';
            return;
        }

        const parsedCoords = this.parseLatLon(typedOrigin);
        if (parsedCoords) {
            coordsDisplay.textContent = `Coordenadas informadas: ${parsedCoords.lat.toFixed(6)}, ${parsedCoords.lon.toFixed(6)}`;
            return;
        }

        if (typedOrigin.length < 5) {
            return;
        }

        try {
            const params = new URLSearchParams({ address: typedOrigin });
            const response = await fetch(`/api/geocode?${params.toString()}`);
            const data = await response.json();
            if (response.ok && data.display_name) {
                coordsDisplay.textContent = `Endereco confirmado: ${data.display_name}`;
            } else {
                coordsDisplay.textContent = 'Nao foi possivel confirmar esse endereco. Revise o texto.';
            }
        } catch (error) {
            coordsDisplay.textContent = 'Nao foi possivel confirmar esse endereco agora.';
        }
    }

    setCurrentLocation(lat, lon, popupTitle = 'Sua localizacao atual', inputText = null, statusText = null) {
        this.currentLocation = { lat, lon };

        document.getElementById('currentLocation').value = inputText || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        document.getElementById('coordsDisplay').textContent = statusText ||
            `Latitude: ${lat.toFixed(6)}, Longitude: ${lon.toFixed(6)}`;

        this.map.setView([lat, lon], 15);
        this.clearMarkers();

        const currentMarker = L.circleMarker(
            [lat, lon],
            {
                radius: 10,
                fillColor: '#1f3a5f',
                color: '#fff',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.9
            }
        ).addTo(this.map);

        currentMarker.bindPopup(popupTitle).openPopup();
        this.markers.push(currentMarker);
    }

    parseLatLon(value) {
        const parts = value.split(',').map((part) => part.trim());
        if (parts.length !== 2) {
            return null;
        }

        const lat = Number.parseFloat(parts[0]);
        const lon = Number.parseFloat(parts[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
        }
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return null;
        }

        return { lat, lon };
    }

    async resolveCurrentLocation() {
        if (this.currentLocation) {
            return true;
        }

        const currentLocationInput = document.getElementById('currentLocation');
        const typedOrigin = (currentLocationInput.value || '').trim();

        if (!typedOrigin) {
            this.showAlert('Digite sua origem ou clique em Detectar.', 'warning');
            return false;
        }

        const parsedCoords = this.parseLatLon(typedOrigin);
        if (parsedCoords) {
            this.setCurrentLocation(
                parsedCoords.lat,
                parsedCoords.lon,
                'Origem definida manualmente',
                typedOrigin,
                `Coordenadas confirmadas: ${parsedCoords.lat.toFixed(6)}, ${parsedCoords.lon.toFixed(6)}`
            );
            this.showAlert('Origem manual definida com sucesso!', 'success');
            return true;
        }

        try {
            this.showAlert('Buscando coordenadas da origem digitada...', 'info');
            const params = new URLSearchParams({ address: typedOrigin });
            const response = await fetch(`/api/geocode?${params.toString()}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Nao foi possivel localizar a origem informada');
            }

            this.setCurrentLocation(
                data.lat,
                data.lon,
                'Origem definida manualmente',
                typedOrigin,
                `Endereco confirmado: ${data.display_name || typedOrigin}`
            );
            this.showAlert('Origem localizada com sucesso!', 'success');
            return true;
        } catch (error) {
            console.error('Erro ao geocodificar origem manual:', error);
            this.showAlert(`Nao foi possivel localizar a origem: ${error.message}`, 'danger');
            return false;
        }
    }

    getCurrentLocation() {
        const btn = document.getElementById('btnGetLocation');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Detectando...';

        const resetButton = () => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-location-crosshairs"></i> Detectar';
        };

        if (!window.isSecureContext) {
            this.showAlert('Ative HTTPS para usar localizacao no navegador.', 'warning');
            resetButton();
            return;
        }

        if (navigator.geolocation) {
            this.showAlert('Quando o navegador perguntar, clique em "Permitir" para compartilhar sua localizacao.', 'info');

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.setCurrentLocation(
                        position.coords.latitude,
                        position.coords.longitude,
                        'Sua localizacao atual'
                    );

                    this.showAlert('Localizacao detectada com sucesso!', 'success');
                    resetButton();
                },
                (error) => {
                    console.error('Erro ao obter localizacao:', error);

                    let message = 'Erro ao obter localizacao. Verifique permissoes do navegador.';
                    if (error && error.code === 1) {
                        message = 'Permissao negada. Clique no cadeado da barra de endereco e permita a localizacao para este site.';
                    } else if (error && error.code === 2) {
                        message = 'Localizacao indisponivel no momento. Tente novamente em instantes.';
                    } else if (error && error.code === 3) {
                        message = 'Tempo esgotado ao obter localizacao. Tente novamente.';
                    }

                    this.showAlert(message, 'danger');
                    resetButton();
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        } else {
            this.showAlert('Geolocalizacao nao e suportada neste navegador.', 'danger');
            resetButton();
        }
    }

    // ============================================
    // Calculo de Rota
    // ============================================
    async calculateRoute() {
        const hasCurrentLocation = await this.resolveCurrentLocation();
        if (!hasCurrentLocation) {
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
            if (Array.isArray(data.not_found) && data.not_found.length > 0) {
                this.showAlert(`Rota otimizada, mas ${data.not_found.length} endereco(s) nao foram localizados.`, 'warning');
            } else {
                this.showAlert('Rota otimizada com sucesso!', 'success');
            }

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

    buildGoogleMapsMultiStopUrl() {
        if (!this.currentLocation || !this.optimizedRoute || !this.optimizedRoute.optimized_order || this.optimizedRoute.optimized_order.length === 0) {
            return null;
        }

        const points = this.optimizedRoute.optimized_order;
        const origin = `${this.currentLocation.lat},${this.currentLocation.lon}`;
        const destinationPoint = points[points.length - 1];
        const destination = `${destinationPoint.lat},${destinationPoint.lon}`;
        const params = new URLSearchParams({
            api: '1',
            origin,
            destination,
            travelmode: 'driving'
        });

        if (points.length > 1) {
            const waypoints = points
                .slice(0, points.length - 1)
                .map((p) => `${p.lat},${p.lon}`)
                .join('|');
            params.set('waypoints', waypoints);
        }

        return `https://www.google.com/maps/dir/?${params.toString()}`;
    }

    openGoogleSequence() {
        const url = this.buildGoogleMapsMultiStopUrl();
        if (!url) {
            this.showAlert('Calcule uma rota primeiro.', 'warning');
            return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    openWazeSequence() {
        if (!this.optimizedRoute || !this.optimizedRoute.optimized_order || this.optimizedRoute.optimized_order.length === 0) {
            this.showAlert('Calcule uma rota primeiro.', 'warning');
            return;
        }

        const urls = this.optimizedRoute.optimized_order.map((location) => this.buildWazeUrl(location.lat, location.lon));
        let index = 0;
        let openedCount = 0;

        const openNext = () => {
            if (index >= urls.length) {
                if (openedCount === 0) {
                    this.showAlert('O navegador bloqueou as aberturas automáticas. Use os botoes Waze da lista.', 'warning');
                } else {
                    this.showAlert(`Sequencia enviada ao Waze (${openedCount}/${urls.length}).`, 'success');
                }
                return;
            }

            const popup = window.open(urls[index], '_blank', 'noopener,noreferrer');
            if (popup !== null) {
                openedCount += 1;
            }
            index += 1;
            setTimeout(openNext, 1300);
        };

        this.showAlert('Abrindo paradas em sequencia no Waze...', 'info');
        openNext();
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
        document.getElementById('addressBulkInput').value = '';
        document.getElementById('addressList').value = '';
        document.getElementById('currentLocation').value = '';
        document.getElementById('coordsDisplay').textContent = 'Digite sua origem manualmente ou clique em "Detectar"';
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
