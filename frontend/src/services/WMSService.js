class WMSService {
  constructor() {
    this.wmsLayers = new Map();
    this.initializeWMSLayers();
  }

  initializeWMSLayers() {
    // NASA Worldview Layers
    this.wmsLayers.set('nasa_modis_terra', {
      name: 'NASA MODIS Terra',
      description: 'Real-time satellite imagery from NASA',
      icon: '🛰️',
      category: 'satellite',
      url: 'https://map1.vis.earthdata.nasa.gov/wmts-geo/wmts.cgi',
      layers: 'MODIS_Terra_CorrectedReflectance_TrueColor',
      format: 'image/jpeg',
      transparent: false,
      attribution: '© NASA Worldview',
      maxZoom: 8,
      tileSize: 512
    });

    this.wmsLayers.set('nasa_viirs', {
      name: 'NASA VIIRS',
      description: 'Visible Infrared Imaging Radiometer Suite',
      icon: '🌍',
      category: 'satellite',
      url: 'https://map1.vis.earthdata.nasa.gov/wmts-geo/wmts.cgi',
      layers: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
      format: 'image/jpeg',
      transparent: false,
      attribution: '© NASA VIIRS',
      maxZoom: 8,
      tileSize: 512
    });

    // Alternative satellite layers that work better
    this.wmsLayers.set('esri_world_imagery', {
      name: 'Esri World Imagery',
      description: 'High-resolution satellite imagery',
      icon: '🌍',
      category: 'satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      layers: '',
      format: 'image/jpeg',
      transparent: false,
      attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics',
      maxZoom: 19
    });

    // Weather Layers
    this.wmsLayers.set('openweather_precipitation', {
      name: 'OpenWeather Precipitation',
      description: 'Global precipitation data',
      icon: '🌧️',
      category: 'weather',
      url: 'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=',
      layers: '',
      format: 'image/png',
      transparent: true,
      attribution: '© OpenWeatherMap',
      maxZoom: 10,
      requiresApiKey: true
    });

    this.wmsLayers.set('openweather_clouds', {
      name: 'OpenWeather Clouds',
      description: 'Global cloud coverage',
      icon: '☁️',
      category: 'weather',
      url: 'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=',
      layers: '',
      format: 'image/png',
      transparent: true,
      attribution: '© OpenWeatherMap',
      maxZoom: 10,
      requiresApiKey: true
    });

    // Topographic Layers
    this.wmsLayers.set('stamen_terrain', {
      name: 'Stamen Terrain',
      description: 'Terrain and elevation visualization',
      icon: '⛰️',
      category: 'topographic',
      url: 'https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
      layers: '',
      format: 'image/jpeg',
      transparent: false,
      attribution: '© Stamen Design, © OpenStreetMap contributors',
      maxZoom: 14
    });

    this.wmsLayers.set('usgs_elevation', {
      name: 'USGS Elevation',
      description: 'US Geological Survey elevation data',
      icon: '🗻',
      category: 'topographic',
      url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
      layers: '',
      format: 'image/jpeg',
      transparent: false,
      attribution: '© USGS',
      maxZoom: 16
    });

    // Scientific/Environmental Layers
    this.wmsLayers.set('cartodb_dark_matter', {
      name: 'CartoDB Dark Matter',
      description: 'Dark theme base map for overlays',
      icon: '🌑',
      category: 'base',
      url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
      layers: '',
      format: 'image/png',
      transparent: false,
      attribution: '© CartoDB, © OpenStreetMap contributors',
      maxZoom: 19,
      subdomains: ['a', 'b', 'c', 'd']
    });

    this.wmsLayers.set('cartodb_positron', {
      name: 'CartoDB Positron',
      description: 'Light theme base map',
      icon: '🌕',
      category: 'base',
      url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
      layers: '',
      format: 'image/png',
      transparent: false,
      attribution: '© CartoDB, © OpenStreetMap contributors',
      maxZoom: 19,
      subdomains: ['a', 'b', 'c', 'd']
    });
  }

  getLayer(layerId) {
    return this.wmsLayers.get(layerId);
  }

  // Create Leaflet WMS layer configuration (L will be available when imported)
  createLeafletLayerConfig(layerId, options = {}) {
    const layerConfig = this.getLayer(layerId);
    if (!layerConfig) {
      throw new Error(`WMS layer '${layerId}' not found`);
    }

    // For WMTS layers (like NASA), use a different approach
    if (layerConfig.url.includes('wmts')) {
      return this.createWMTSLayerConfig(layerConfig, options);
    }

    // Standard WMS layer configuration
    return {
      type: 'wms',
      url: layerConfig.url,
      options: {
        layers: layerConfig.layers,
        format: layerConfig.format,
        transparent: layerConfig.transparent,
        attribution: layerConfig.attribution,
        maxZoom: layerConfig.maxZoom || 18,
        tileSize: layerConfig.tileSize || 256,
        ...options
      }
    };
  }

  createWMTSLayerConfig(layerConfig, options = {}) {
    // For NASA WMTS layers, construct the URL template
    const today = new Date().toISOString().split('T')[0];
    const urlTemplate = `${layerConfig.url}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layerConfig.layers}&STYLE=default&TILEMATRIXSET=EPSG4326_250m&TILEMATRIX=EPSG4326_250m:{z}&TILEROW={y}&TILECOL={x}&FORMAT=${layerConfig.format}&TIME=${today}`;

    return {
      type: 'tile',
      url: urlTemplate,
      options: {
        attribution: layerConfig.attribution,
        maxZoom: layerConfig.maxZoom || 8,
        tileSize: layerConfig.tileSize || 512,
        ...options
      }
    };
  }
  getAllLayers() {
    return Array.from(this.wmsLayers.entries()).map(([id, layer]) => ({
      id,
      ...layer
    }));
  }

  getLayersByCategory(category) {
    return this.getAllLayers().filter(layer => layer.category === category);
  }

  getCategories() {
    const categories = new Set();
    this.wmsLayers.forEach(layer => categories.add(layer.category));
    return Array.from(categories).map(category => ({
      id: category,
      name: this.capitalizeCategoryName(category),
      layers: this.getLayersByCategory(category)
    }));
  }

  capitalizeCategoryName(category) {
    return category.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  // Voice command integration for layer detection
  detectLayerFromCommand(command) {
    const normalized = command.toLowerCase();
    
    // Direct layer name matches
    for (const [id, layer] of this.wmsLayers) {
      if (normalized.includes(layer.name.toLowerCase()) || 
          normalized.includes(id.replace('_', ' '))) {
        return id;
      }
    }

    // Keyword-based detection
    if (normalized.includes('satellite') || normalized.includes('imagery') || normalized.includes('aerial')) {
      return 'esri_world_imagery';
    }
    if (normalized.includes('weather') || normalized.includes('rain') || normalized.includes('precipitation')) {
      return 'openweather_precipitation';
    }
    if (normalized.includes('cloud')) {
      return 'openweather_clouds';
    }
    if (normalized.includes('elevation') || normalized.includes('terrain') || normalized.includes('topographic')) {
      return 'stamen_terrain';
    }
    if (normalized.includes('dark') || normalized.includes('night')) {
      return 'cartodb_dark_matter';
    }
    if (normalized.includes('light') || normalized.includes('clean')) {
      return 'cartodb_positron';
    }
    if (normalized.includes('nasa')) {
      return 'nasa_modis_terra';
    }
    if (normalized.includes('usgs') || normalized.includes('geological')) {
      return 'usgs_elevation';
    }

    return null;
  }

  // Get layer information for voice feedback
  getLayerInfo(layerId) {
    const layer = this.getLayer(layerId);
    return layer ? {
      name: layer.name,
      description: layer.description,
      category: layer.category,
      icon: layer.icon
    } : null;
  }

}

// Create and export singleton instance
export const wmsService = new WMSService();