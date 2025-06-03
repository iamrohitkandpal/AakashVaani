class WMSService {
  constructor() {
    this.wmsLayers = [
      {
        id: "nasa_modis_terra",
        name: "NASA MODIS Terra",
        category: "satellite",
        url: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
        layers: "MODIS_Terra_CorrectedReflectance_TrueColor",
        attribution: "© NASA Earth Observing System",
        transparent: true,
        format: "image/jpeg",
        maxZoom: 8,
        icon: "🛰️"
      },
      {
        id: "nasa_viirs",
        name: "NASA VIIRS",
        category: "satellite",
        url: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
        layers: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
        attribution: "© NASA Earth Observing System",
        transparent: true,
        format: "image/jpeg",
        maxZoom: 8,
        icon: "🔭"
      },
      {
        id: "esri_world_imagery",
        name: "Esri World Imagery",
        category: "satellite",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: "© Esri, Maxar, GeoEye, Earthstar Geographics",
        maxZoom: 19,
        icon: "🌍"
      },
      {
        id: "openweather_precipitation",
        name: "OpenWeather Precipitation",
        category: "weather",
        url: "https://tile.openweathermap.org/map/precipitation/{z}/{x}/{y}.png",
        attribution: "© OpenWeatherMap",
        transparent: true,
        format: "image/png",
        maxZoom: 19,
        icon: "🌧️"
      }
    ];
  }

  getAllLayers() {
    return this.wmsLayers;
  }

  getLayer(id) {
    return this.wmsLayers.find(layer => layer.id === id);
  }

  getLayerInfo(id) {
    const layer = this.getLayer(id);
    return layer ? { 
      name: layer.name, 
      category: layer.category,
      icon: layer.icon 
    } : null;
  }

  // Get layers by category
  getLayersByCategory(category) {
    return this.wmsLayers.filter(layer => layer.category === category);
  }

  // Get categories
  getCategories() {
    const categories = new Set();
    this.wmsLayers.forEach(layer => categories.add(layer.category));
    return Array.from(categories).map(category => ({
      id: category,
      name: this.capitalizeCategoryName(category),
      count: this.wmsLayers.filter(l => l.category === category).length
    }));
  }

  capitalizeCategoryName(category) {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  // Detect layer from voice command
  detectLayerFromCommand(command) {
    if (!command || typeof command !== 'string') return null;
    
    const normalizedCommand = command.toLowerCase();
    
    // Direct layer matching by keyword
    const keywordMap = {
      'nasa': 'nasa_modis_terra',
      'modis': 'nasa_modis_terra',
      'terra': 'nasa_modis_terra',
      'viirs': 'nasa_viirs',
      'esri': 'esri_world_imagery',
      'imagery': 'esri_world_imagery',
      'precipitation': 'openweather_precipitation',
      'rain': 'openweather_precipitation',
      'weather': 'openweather_precipitation'
    };
    
    // Check for direct keyword matches
    for (const [keyword, layerId] of Object.entries(keywordMap)) {
      if (normalizedCommand.includes(keyword)) {
        return layerId;
      }
    }
    
    // Fuzzy match against layer names
    for (const layer of this.wmsLayers) {
      const layerName = layer.name.toLowerCase();
      
      // Check if command contains most of the layer name words
      const layerNameWords = layerName.split(' ');
      const matchCount = layerNameWords.filter(word => 
        normalizedCommand.includes(word.toLowerCase())
      ).length;
      
      if (matchCount > 0 && matchCount >= layerNameWords.length / 2) {
        return layer.id;
      }
    }
    
    return null;
  }
}

export const wmsService = new WMSService();