class WMSService {
  constructor() {
    // Initialize any required properties
  }

  // Get layer configuration
  getLayer(layerId) {
    // This method should be implemented to return layer configuration
    // It will be provided by the implementing application
    throw new Error('getLayer method must be implemented');
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
}

export default WMSService;