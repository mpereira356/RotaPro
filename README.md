# RouteOptimizer 🚚📍

O **RouteOptimizer** é um sistema web inteligente projetado para entregadores (Shopee, Mercado Livre, iFood, etc.) que desejam otimizar suas rotas de entrega automaticamente. O sistema utiliza o algoritmo **Nearest Neighbor** para calcular a ordem mais eficiente de paradas, economizando tempo e combustível.

## ✨ Funcionalidades

- **Geolocalização Automática:** Detecta sua posição atual para iniciar a rota.
- **Geocodificação Gratuita:** Converte endereços em coordenadas usando a API Nominatim (OpenStreetMap).
- **Roteirização Inteligente:** Calcula a melhor sequência de entregas.
- **Mapa Interativo:** Visualização completa da rota com Leaflet.js e OSRM.
- **Histórico Local:** Salva as rotas calculadas em um banco de dados SQLite.
- **Design Moderno:** Interface responsiva e intuitiva baseada em Bootstrap 5.

## 🛠️ Tecnologias Utilizadas

- **Backend:** Python 3.11, Flask, SQLAlchemy, SQLite.
- **Frontend:** HTML5, CSS3, JavaScript (ES6), Bootstrap 5.
- **Mapas:** Leaflet.js, OpenStreetMap, OSRM (Routing), Nominatim (Geocoding).

## 🚀 Como Executar

### 1. Instalar dependências
Certifique-se de ter o Python instalado e execute:
```bash
pip install -r requirements.txt
```

### 2. Iniciar o servidor
```bash
python app.py
```

### 3. Acessar a aplicação
Abra o navegador e acesse:
[http://localhost:5000](http://localhost:5000)

## 📖 Como Usar

1. Clique em **"Detectar"** para capturar sua localização atual (ou insira manualmente se necessário).
2. No campo de texto, cole a lista de endereços que você precisa visitar (um por linha).
3. Clique em **"Calcular Melhor Rota"**.
4. O sistema processará os endereços, otimizará a ordem e mostrará o resultado tanto na lista lateral quanto no mapa interativo.
5. Você verá a distância total e o tempo estimado de percurso.

---
Desenvolvido como uma solução open-source para facilitar o dia a dia de profissionais de logística.
