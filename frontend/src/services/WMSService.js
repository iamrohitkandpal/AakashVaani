class WMSService {
  constructor() {
    // Initialize available layers
    this.layers = [
      {
        id: 'osmStandard',
        name: 'OSM Standard',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ['standard', 'basic', 'default', 'streets', 'map'],
        maxZoom: 19
      },
      {
        id: 'osmHumanitarian',
        name: 'OSM Humanitarian',
        url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank">HOT</a>',
        keywords: ['humanitarian', 'disaster', 'relief', 'help'],
        maxZoom: 19
      },
      {
        id: 'openTopoMap',
        name: 'OpenTopoMap',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        keywords: ['topo', 'topographic', 'terrain', 'elevation', 'contour'],
        maxZoom: 17
      },
      {
        id: 'esriSatellite',
        name: 'ESRI Satellite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        keywords: ['satellite', 'aerial', 'imagery', 'photo'],
        maxZoom: 19
      },
      {
        id: 'cartoDbDark',
        name: 'CartoDB Dark Matter',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        keywords: ['dark', 'black', 'night', 'dark mode'],
        maxZoom: 19
      },
      {
        id: 'cartoDbVoyager',
        name: 'CartoDB Voyager',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        keywords: ['minimal', 'light', 'clean', 'simple'],
        maxZoom: 19
      },
      {
        id: 'cycleOsm',
        name: 'Cycle Routes',
        url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases" title="CyclOSM - Open Bicycle render">CyclOSM</a> | Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ['bicycle', 'bike', 'cycle', 'cycling', 'biking'],
        maxZoom: 20
      },
      {
        id: 'openRailwayMap',
        name: 'Railway Infrastructure',
        url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map style: &copy; <a href="https://www.OpenRailwayMap.org">OpenRailwayMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        keywords: ['railway', 'train', 'rail', 'transportation'],
        maxZoom: 19
      },
      {
        id: 'openSeaMap',
        name: 'Sea Map',
        url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data: &copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors',
        keywords: ['sea', 'ocean', 'maritime', 'nautical'],
        maxZoom: 18
      },
      {
        id: 'thunderforestOutdoors',
        name: 'Outdoors',
        url: 'https://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ['outdoors', 'hiking', 'trails', 'mountains', 'terrain'],
        maxZoom: 18
      },
      {
        id: 'thunderforestTransport',
        name: 'Transport',
        url: 'https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ['transport', 'transportation', 'transit', 'traffic'],
        maxZoom: 18
      },
      {
        id: 'stamenTerrain',
        name: 'Terrain',
        url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ['terrain', 'topography', 'elevation', 'hillshade'],
        maxZoom: 18
      },
      {
        id: 'stamenWatercolor',
        name: 'Watercolor',
        url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: true,
        attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        keywords: ['watercolor', 'artistic', 'art', 'style'],
        maxZoom: 16
      },
      {
        id: 'openPtMap',
        name: 'Public Transport',
        url: 'http://openptmap.org/tiles/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: '&copy; <a href="http://www.openptmap.org">OpenPtMap</a> contributors',
        keywords: ['public', 'transport', 'transit', 'bus', 'train', 'subway'],
        maxZoom: 17
      },
      {
        id: 'openWeatherPrecipitation',
        name: 'Precipitation',
        url: 'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>',
        keywords: ['precipitation', 'rain', 'weather'],
        maxZoom: 19
      },
      {
        id: 'openWeatherClouds',
        name: 'Clouds',
        url: 'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>',
        keywords: ['clouds', 'weather', 'cloud cover'],
        maxZoom: 19
      },
      {
        id: 'openWeatherTemp',
        name: 'Temperature',
        url: 'https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png',
        type: 'tile',
        isWMS: false,
        isBase: false,
        overlay: true,
        attribution: 'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>',
        keywords: ['temperature', 'weather', 'heat'],
        maxZoom: 19
      }
    ];
  }

  getAllLayers() {
    return this.layers;
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
      isWMS: layer.isWMS,
      isBase: layer.isBase,
      isOverlay: layer.overlay || false,
      attribution: layer.attribution,
      keywords: layer.keywords
    };
  }
  
  getBaseLayers() {
    return this.layers.filter(layer => layer.isBase);
  }
  
  getOverlays() {
    return this.layers.filter(layer => layer.overlay);
  }
  
  // Detect layer ID from a voice command
  detectLayerFromCommand(command) {
    if (!command) return null;
    
    const commandLower = command.toLowerCase().trim();
    
    // First try direct match with ID
    const directMatch = this.layers.find(layer => layer.id.toLowerCase() === commandLower);
    if (directMatch) return directMatch.id;
    
    // Then try direct match with name
    const nameMatch = this.layers.find(layer => layer.name.toLowerCase() === commandLower);
    if (nameMatch) return nameMatch.id;
    
    // Then try keyword matching
    for (const layer of this.layers) {
      if (layer.keywords && layer.keywords.length > 0) {
        for (const keyword of layer.keywords) {
          if (commandLower === keyword || commandLower.includes(keyword)) {
            return layer.id;
          }
        }
      }
    }
    
    // Map some common synonyms
    const synonymMap = {
      'aerial': 'esriSatellite',
      'satellite': 'esriSatellite',
      'imagery': 'esriSatellite',
      'photo': 'esriSatellite',
      'dark': 'cartoDbDark',
      'night': 'cartoDbDark',
      'standard': 'osmStandard',
      'basic': 'osmStandard',
      'default': 'osmStandard',
      'cycle': 'cycleOsm',
      'bike': 'cycleOsm',
      'cycling': 'cycleOsm',
      'train': 'openRailwayMap',
      'railway': 'openRailwayMap',
      'rail': 'openRailwayMap',
      'sea': 'openSeaMap',
      'ocean': 'openSeaMap',
      'nautical': 'openSeaMap',
      'hiking': 'thunderforestOutdoors',
      'outdoor': 'thunderforestOutdoors',
      'outdoors': 'thunderforestOutdoors',
      'transportation': 'thunderforestTransport',
      'transit': 'openPtMap',
      'bus': 'openPtMap',
      'public transport': 'openPtMap',
      'terrain': 'stamenTerrain',
      'topography': 'stamenTerrain',
      'elevation': 'stamenTerrain',
      'watercolor': 'stamenWatercolor',
      'artistic': 'stamenWatercolor',
      'rain': 'openWeatherPrecipitation',
      'precipitation': 'openWeatherPrecipitation',
      'cloud': 'openWeatherClouds',
      'clouds': 'openWeatherClouds',
      'temperature': 'openWeatherTemp',
      'heat': 'openWeatherTemp',
      'topo': 'openTopoMap',
      'topographic': 'openTopoMap'
    };
    
    if (synonymMap[commandLower]) {
      return synonymMap[commandLower];
    }
    
    // No match found
    return null;
  }
}

export const wmsService = new WMSService();