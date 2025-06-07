class WMSService {
  constructor() {
    // Get API keys from environment
    this.openWeatherApiKey = process.env.REACT_APP_OPENWEATHERMAP_API_KEY || '';
    this.thunderforestApiKey = process.env.REACT_APP_THUNDERFOREST_API_KEY || '';
    this.bhuvanApiKey = process.env.REACT_APP_BHUVAN_API_KEY || '';
    this.nasaApiKey = process.env.REACT_APP_NASA_API_KEY || '';
    
    // Check if API keys are valid
    this.hasOpenWeatherKey = this.openWeatherApiKey && this.openWeatherApiKey !== 'DEMO_KEY';
    this.hasThunderforestKey = this.thunderforestApiKey && this.thunderforestApiKey !== 'DEMO_KEY'; // Fixed variable name
    this.hasBhuvanKey = this.bhuvanApiKey && this.bhuvanApiKey !== 'DEMO_KEY';
    this.hasNasaKey = this.nasaApiKey && this.nasaApiKey !== 'DEMO_KEY';
    
    // Log warnings for missing keys (helpful for debugging)
    if (!this.openWeatherApiKey) console.warn('OpenWeatherMap API key not provided in environment variables');
    if (!this.thunderforestApiKey) console.warn('Thunderforest API key not provided in environment variables');
    if (!this.bhuvanApiKey) console.warn('Bhuvan API key not provided in environment variables');
    if (!this.nasaApiKey) console.warn('NASA API key not provided in environment variables');
    
    if (!this.hasOpenWeatherKey) console.warn('OpenWeatherMap API key provided but appears to be invalid');
    if (!this.hasThunderforestKey) console.warn('Thunderforest API key provided but appears to be invalid');
    if (!this.hasBhuvanKey) console.warn('Bhuvan API key provided but appears to be invalid');
    if (!this.hasNasaKey) console.warn('NASA API key provided but appears to be invalid');
    
    // Enhanced layer categories for better organization
    this.categories = [
      { id: 'base', name: 'Base Maps', description: 'Background map styles' },
      { id: 'satellite', name: 'Satellite & Aerial', description: 'Satellite imagery' },
      { id: 'terrain', name: 'Terrain & Elevation', description: 'Topographic information' },
      { id: 'transportation', name: 'Transportation', description: 'Roads, rail, and transit' },
      { id: 'weather', name: 'Weather & Climate', description: 'Weather conditions and forecasts' },
      { id: 'environment', name: 'Environment', description: 'Environmental data' },
      { id: 'boundaries', name: 'Boundaries', description: 'Administrative boundaries' },
      { id: 'overlay', name: 'Overlays', description: 'Additional information layers' }
    ];
    
    // Initialize available layers with expanded sources
    this.layers = [
      // Base Maps
      {
        id: "osmStandard",
        name: "OpenStreetMap",
        category: 'base',
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        type: "tile",
        isWMS: false,
        isBase: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ["standard", "basic", "default", "osm", "street map", "roads"],
        maxZoom: 19,
      },
      {
        id: "osmHumanitarian",
        name: "OSM Humanitarian",
        category: 'base',
        url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
        type: "tile",
        isWMS: false,
        isBase: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/">HOT</a>',
        keywords: ["humanitarian", "crisis", "aid", "disaster", "emergency"],
        maxZoom: 19,
      },
      
      // Satellite imagery
      {
        id: "esriSatellite",
        name: "ESRI Satellite",
        category: 'satellite',
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        type: "tile",
        isWMS: false,
        isBase: true,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        keywords: ["satellite", "aerial", "imagery", "photo", "esri"],
        maxZoom: 18,
      },
      {
        id: "nasaWorldview",
        name: "NASA GIBS Worldview",
        category: 'satellite',
        url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
        type: "tile",
        isWMS: false,
        isBase: true,
        time: function() {
          let date = new Date();
          date.setDate(date.getDate() - 1); // Yesterday's date (NASA data is delayed)
          return date.toISOString().split('T')[0];
        },
        attribution: 'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (<a href="https://earthdata.nasa.gov">ESDIS</a>) with funding provided by NASA/HQ.',
        keywords: ["nasa", "satellite", "modis", "terra", "earth", "true color"],
        maxZoom: 9,
      },
      
      // Terrain
      {
        id: "openTopoMap",
        name: "OpenTopoMap",
        category: 'terrain',
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        type: "tile",
        isWMS: false,
        isBase: true,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        keywords: ["topo", "topographic", "elevation", "terrain", "contour", "height"],
        maxZoom: 17,
      },
      {
        id: "stamenTerrain",
        name: "Stamen Terrain",
        category: 'terrain',
        url: "https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png",
        type: "tile",
        isWMS: false,
        isBase: true,
        attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ["terrain", "topography", "elevation", "height", "mountains", "hills", "stamen"],
        maxZoom: 18,
      },
      
      // Transportation
      {
        id: "cycleOsm",
        name: "Cycle Routes",
        category: 'transportation',
        url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
        type: "tile",
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases">CyclOSM</a> | Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ["cycle", "bike", "cycling", "bicycle", "route"],
        maxZoom: 20,
      },
      {
        id: "openRailwayMap",
        name: "Railways",
        category: 'transportation',
        url: "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
        type: "tile",
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map style: &copy; <a href="https://www.OpenRailwayMap.org">OpenRailwayMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        keywords: ["train", "railway", "rail", "transportation", "transit", "tracks"],
        maxZoom: 19,
      },
      {
        id: "openPtMap",
        name: "Public Transport",
        category: 'transportation',
        url: "http://openptmap.org/tiles/{z}/{x}/{y}.png",
        type: "tile",
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map style: &copy; <a href="http://openptmap.org">OpenPtMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        keywords: ["transit", "public transport", "bus", "train", "tram", "subway", "metro"],
        maxZoom: 17,
      },
      {
        id: "thunderforestTransport",
        name: "Transport Map",
        category: 'transportation',
        url: `https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=${this.thunderforestApiKey}`,
        type: "tile",
        isWMS: false,
        isBase: true,
        attribution: '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ["transport", "transportation", "transit", "roads", "highways"],
        maxZoom: 18,
      },
      
      // Marine layers
      {
        id: "openSeaMap",
        name: "Sea Map",
        category: 'overlay',
        url: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
        type: "tile",
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data: &copy; <a href="https://www.openseamap.org">OpenSeaMap</a> contributors',
        keywords: ["sea", "ocean", "maritime", "marine", "nautical", "waters"],
        maxZoom: 18,
      },

      // Weather layers
      {
        id: "openWeatherPrecipitation",
        name: "Precipitation",
        category: 'weather',
        url: this.hasOpenWeatherKey 
          ? `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${this.openWeatherApiKey}`
          : null, // Will be filtered out if null
        disabled: !this.hasOpenWeatherKey,
        disabledReason: !this.hasOpenWeatherKey ? "API key required" : null,
        type: "tile",
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>',
        keywords: ["precipitation", "rain", "weather", "rainfall"],
        maxZoom: 19,
      },
      {
        id: "openWeatherClouds",
        name: "Clouds",
        category: 'weather',
        url: this.hasOpenWeatherKey 
          ? `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${this.openWeatherApiKey}`
          : null,
        disabled: !this.hasOpenWeatherKey,
        disabledReason: !this.hasOpenWeatherKey ? "API key required" : null,
        type: "tile",
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>',
        keywords: ["clouds", "weather", "cloud cover", "sky"],
        maxZoom: 19,
      },
      {
        id: "openWeatherTemp",
        name: "Temperature",
        category: 'weather',
        url: this.hasOpenWeatherKey 
          ? `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${this.openWeatherApiKey}`
          : null,
        disabled: !this.hasOpenWeatherKey,
        disabledReason: !this.hasOpenWeatherKey ? "API key required" : null,
        type: "tile",
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>',
        keywords: ["temperature", "weather", "heat", "cold", "degrees"],
        maxZoom: 19,
      },
      {
        id: "openWeatherWind",
        name: "Wind Speed",
        category: 'weather',
        url: this.hasOpenWeatherKey 
          ? `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${this.openWeatherApiKey}`
          : null,
        disabled: !this.hasOpenWeatherKey,
        disabledReason: !this.hasOpenWeatherKey ? "API key required" : null,
        type: "tile",
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>',
        keywords: ["wind", "weather", "speed", "breeze", "gale"],
        maxZoom: 19,
      },
      
      // India-specific layers (Bhuvan)
      {
        id: "bhuvanHybrid",
        name: "Bhuvan Hybrid",
        category: 'satellite',
        url: "https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms?service=WMS",
        layers: "india3",
        type: "wms",
        isWMS: true,
        isBase: true,
        format: 'image/png',
        transparent: true,
        attribution: '&copy; <a href="https://bhuvan.nrsc.gov.in">Bhuvan, ISRO</a>',
        keywords: ["india", "bhuvan", "isro", "hybrid", "satellite"],
        maxZoom: 18,
      },
    ].filter(layer => layer.url !== null); // Filter out layers with null URLs
  }

  getAllLayers() {
    return this.layers.map(layer => {
      // Add warning property for disabled layers
      if (layer.disabled) {
        return {
          ...layer,
          warning: `This layer requires an API key (${layer.disabledReason})`,
        };
      }
      return layer;
    });
  }

  getLayersByCategory(categoryId) {
    return this.layers.filter(layer => layer.category === categoryId);
  }

  getCategories() {
    return this.categories;
  }

  getLayer(id) {
    return this.layers.find(layer => layer.id === id);
  }

  getLayerInfo(id) {
    const layer = this.getLayer(id);
    if (!layer) return null;
    return {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      isBase: layer.isBase,
      isOverlay: layer.overlay,
      category: layer.category,
      attribution: layer.attribution,
      keywords: layer.keywords,
      description: this.categories.find(cat => cat.id === layer.category)?.description || ''
    };
  }

  getBaseLayers() {
    return this.layers.filter(layer => layer.isBase);
  }

  getOverlays() {
    return this.layers.filter(layer => layer.overlay);
  }

  // Enhanced detectLayerFromCommand function for more accuracy
  detectLayerFromCommand(command) {
    if (!command || typeof command !== 'string') return null;
    
    const commandLower = command.toLowerCase().trim();
    console.log("Detecting layer from command:", commandLower);
    
    // Create scoring system to find best match
    const scores = this.layers.map(layer => {
      let score = 0;
      
      // Check exact ID match (highest priority)
      if (layer.id.toLowerCase() === commandLower) {
        score += 100;
      }
      
      // Check exact name match (very high priority)
      if (layer.name && layer.name.toLowerCase() === commandLower) {
        score += 90;
      }
      
      // Check keywords exact match (high priority)
      if (layer.keywords && Array.isArray(layer.keywords)) {
        for (const keyword of layer.keywords) {
          if (keyword.toLowerCase() === commandLower) {
            score += 80;
          }
        }
      }
      
      // Check category match (good priority)
      if (layer.category && layer.category.toLowerCase() === commandLower) {
        score += 70;
      }
      
      // Check contains matches (medium priority)
      if (layer.id.toLowerCase().includes(commandLower) || commandLower.includes(layer.id.toLowerCase())) {
        score += 50;
      }
      
      if (layer.name && (layer.name.toLowerCase().includes(commandLower) || commandLower.includes(layer.name.toLowerCase()))) {
        score += 40;
      }
      
      // Check keyword partial matches (lower priority)
      if (layer.keywords && Array.isArray(layer.keywords)) {
        for (const keyword of layer.keywords) {
          if (keyword.toLowerCase().includes(commandLower) || commandLower.includes(keyword.toLowerCase())) {
            score += 30;
          }
        }
      }
      
      // Check common term mappings (lowest priority)
      const commonTerms = {
        'weather': ['precipitation', 'clouds', 'temperature', 'climate', 'rain', 'snow', 'wind'],
        'traffic': ['transport', 'roads', 'cars', 'vehicles'],
        'satellite': ['aerial', 'imagery', 'earth', 'from space'],
        'terrain': ['elevation', 'topo', 'mountain', 'hill', 'topography'],
        'street': ['osm', 'standard', 'road', 'map'],
        'bike': ['cycle', 'bicycle', 'cycling'],
      };
      
      // Check if command contains any common terms
      for (const [term, mappedTerms] of Object.entries(commonTerms)) {
        if (commandLower.includes(term)) {
          // If the layer is related to any mapped terms, add score
          if (mappedTerms.some(mappedTerm => 
            layer.id.toLowerCase().includes(mappedTerm) || 
            (layer.name && layer.name.toLowerCase().includes(mappedTerm))
          )) {
            score += 20;
          }
        }
      }
      
      // Check disabled status - penalize disabled layers
      if (layer.disabled) {
        score -= 50;
      }
      
      return { layer, score };
    });
    
    // Sort by score and get the best match
    scores.sort((a, b) => b.score - a.score);
    
    // Only consider matches with score > 0
    if (scores.length > 0 && scores[0].score > 0) {
      console.log('Best layer match:', scores[0].layer.id, 'with score', scores[0].score);
      return scores[0].layer.id;
    }
    
    console.log("No layer match found for:", commandLower);
    return null;
  }
  
  // Methods for geospatial data visualization (new)
  
  // Convert GeoJSON to Leaflet layer
  createGeoJsonLayer(geoJson, options = {}) {
    if (!geoJson) return null;
    
    try {
      // Ensure Leaflet is loaded
      if (typeof L === 'undefined') {
        console.error('Leaflet is not available. Make sure it is properly loaded.');
        return null;
      }
      
      // Default style for GeoJSON features
      const defaultStyle = {
        color: '#3388ff',
        weight: 3,
        opacity: 0.7,
        fillOpacity: 0.2,
        fillColor: '#3388ff'
      };
      
      // Handler for feature popups and tooltips
      const defaultEachFeature = (feature, layer) => {
        if (feature.properties) {
          // Create popup content from properties
          const props = feature.properties;
          let popupContent = '<div class="geojson-popup">';
          
          // Add title if available
          if (props.name || props.title) {
            popupContent += `<h3>${props.name || props.title}</h3>`;
          }
          
          // Add description if available
          if (props.description) {
            popupContent += `<p>${props.description}</p>`;
          }
          
          // Add table of other properties
          popupContent += '<table class="geojson-props">';
          for (const [key, value] of Object.entries(props)) {
            if (!['name', 'title', 'description'].includes(key) && value !== null) {
              popupContent += `<tr><th>${key}</th><td>${value}</td></tr>`;
            }
          }
          popupContent += '</table></div>';
          
          layer.bindPopup(popupContent);
          
          // Add tooltip if there's a name
          if (props.name || props.title) {
            layer.bindTooltip(props.name || props.title);
          }
        }
      };
      
      // Custom marker for point features
      const defaultPointToLayer = (feature, latlng) => {
        // Use custom icon if provided, otherwise default
        const icon = options.pointIcon || new L.Icon.Default();
        return L.marker(latlng, { icon });
      };
      
      // Merge default options with provided options
      const layerOptions = {
        style: options.style || defaultStyle,
        onEachFeature: options.onEachFeature || defaultEachFeature,
        pointToLayer: options.pointToLayer || defaultPointToLayer
      };
      
      // Create and return the GeoJSON layer
      return L.geoJSON(geoJson, layerOptions);
    } catch (error) {
      console.error('Error creating GeoJSON layer:', error);
      return null;
    }
  }
  
  // Create heatmap layer from points
  createHeatmapLayer(points, options = {}) {
    if (!points || !Array.isArray(points) || points.length === 0) {
      console.error('Invalid points data for heatmap');
      return null;
    }
    
    try {
      // Check if Leaflet and Leaflet.heat plugin are loaded
      if (typeof L === 'undefined' || typeof L.heatLayer === 'undefined') {
        console.error('Leaflet or Leaflet.heat not available.');
        
        // Return a placeholder layer
        const placeholderLayer = L.layerGroup();
        placeholderLayer.addLayer(
          L.marker([0, 0])
            .bindPopup('Heatmap plugin not loaded. Please add Leaflet.heat to your project.')
        );
        return placeholderLayer;
      }
      
      // Format the points into expected [lat, lng, intensity] format
      const heatPoints = points.map(p => {
        // If already in [lat, lng, intensity] format
        if (Array.isArray(p) && p.length >= 2) {
          return p;
        }
        
        // If in {lat, lng, value} format
        if (p && typeof p === 'object') {
          const lat = p.lat || p.latitude;
          const lng = p.lng || p.longitude || p.lon;
          const intensity = p.intensity || p.value || p.weight || 1;
          
          if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
            return [lat, lng, intensity];
          }
        }
        
        return null;
      }).filter(p => p !== null);
      
      if (heatPoints.length === 0) {
        console.warn('No valid points found for heatmap after filtering');
        return L.layerGroup(); // Return empty layer group
      }
      
      // Default options for the heatmap
      const defaultOptions = {
        radius: 25,        // Size of each point
        blur: 15,          // Amount of blur
        maxZoom: 17,       // Don't show points beyond this zoom level
        max: 1.0,          // Maximum intensity
        gradient: {        // Color gradient
          0.4: 'blue',
          0.6: 'cyan',
          0.7: 'lime',
          0.8: 'yellow',
          1.0: 'red'
        }
      };
      
      // Merge default options with provided options
      const heatOptions = {...defaultOptions, ...options};
      
      // Create and return the heatmap layer
      return L.heatLayer(heatPoints, heatOptions);
    } catch (error) {
      console.error('Error creating heatmap layer:', error);
      return L.layerGroup(); // Return empty layer group on error
    }
  }
}

export const wmsService = new WMSService();
