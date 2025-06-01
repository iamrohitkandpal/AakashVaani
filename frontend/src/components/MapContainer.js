import React, { useEffect, useRef, useState } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { wmsService } from '../services/WMSService';

// Fix for default markers in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Enhanced Map event handler component with WMS support
const MapEventHandler = ({ onMapReady, onLocationUpdate, currentLayer, activeLayers }) => {
  const map = useMap();
  const wmsLayersRef = useRef(new Map());

  useEffect(() => {
    if (map && onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  // Handle WMS layer changes
  useEffect(() => {
    if (!map) return;

    // Remove layers that are no longer active
    wmsLayersRef.current.forEach((layer, layerId) => {
      if (!activeLayers.has(layerId)) {
        map.removeLayer(layer);
        wmsLayersRef.current.delete(layerId);
      }
    });

    // Add new active layers
    activeLayers.forEach(layerId => {
      if (!wmsLayersRef.current.has(layerId)) {
        const layerConfig = wmsService.getLayer(layerId);
        if (layerConfig) {
          try {
            let leafletLayer;
            
            // Create different types of layers based on configuration
            if (layerConfig.url.includes('{z}') || layerConfig.subdomains) {
              // Tile layer
              leafletLayer = L.tileLayer(layerConfig.url, {
                attribution: layerConfig.attribution,
                maxZoom: layerConfig.maxZoom || 18,
                opacity: 0.7,
                subdomains: layerConfig.subdomains || []
              });
            } else if (layerConfig.layers) {
              // WMS layer
              leafletLayer = L.tileLayer.wms(layerConfig.url, {
                layers: layerConfig.layers,
                format: layerConfig.format,
                transparent: layerConfig.transparent,
                attribution: layerConfig.attribution,
                maxZoom: layerConfig.maxZoom || 18,
                opacity: 0.7
              });
            }

            if (leafletLayer) {
              leafletLayer.addTo(map);
              wmsLayersRef.current.set(layerId, leafletLayer);
            }
          } catch (error) {
            console.warn(`Failed to add layer ${layerId}:`, error);
          }
        }
      }
    });
  }, [map, activeLayers]);

  useMapEvents({
    click(e) {
      console.log('Map clicked at:', e.latlng);
    },
    zoomend() {
      console.log('Zoom level:', map.getZoom());
    },
    moveend() {
      const center = map.getCenter();
      console.log('Map center:', center);
    }
  });

  // Enhanced geolocation with better accuracy
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          onLocationUpdate(location);
          
          // Update current location marker
          const existingMarker = map._currentLocationMarker;
          if (existingMarker) {
            map.removeLayer(existingMarker);
          }

          const currentLocationMarker = L.marker([location.lat, location.lng], {
            icon: L.divIcon({
              className: 'current-location-marker',
              html: '📍',
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            })
          }).addTo(map);
          
          currentLocationMarker.bindPopup(`📍 Your Current Location<br><small>Accuracy: ${Math.round(location.accuracy)}m</small>`);
          map._currentLocationMarker = currentLocationMarker;
        },
        (error) => {
          console.warn('Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000 // Cache position for 1 minute
        }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }
  }, [map, onLocationUpdate]);

  return null;
};

const MapContainer = ({ onMapReady, onLocationUpdate, voiceStatus, activeLayers = new Set() }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentLayer, setCurrentLayer] = useState('street');
  const [mapMetrics, setMapMetrics] = useState({
    zoom: 6,
    center: null,
    bounds: null
  });
  const mapRef = useRef(null);

  const defaultPosition = [20.5937, 78.9629]; // India center as default

  // Enhanced layer configurations with professional WMS sources
  const layerConfigs = {
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      name: 'Street Map'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
      name: 'Satellite'
    },
    terrain: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '© OpenTopoMap (CC-BY-SA)',
      name: 'Terrain'
    },
    hybrid: {
      url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      attribution: '© Google',
      name: 'Hybrid'
    },
    dark: {
      url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
      attribution: '© CartoDB, © OpenStreetMap contributors',
      name: 'Dark Theme',
      subdomains: ['a', 'b', 'c', 'd']
    }
  };

  const handleMapReady = (map) => {
    setIsLoading(false);
    mapRef.current = map;
    
    // Enhanced map controls and styling
    map.attributionControl.setPrefix('🗺️ Geo Voice Navigator - Professional GIS');
    
    // Add scale control
    L.control.scale({
      metric: true,
      imperial: true,
      position: 'bottomleft'
    }).addTo(map);

    // Add coordinates display
    const coordsControl = L.control({ position: 'bottomright' });
    coordsControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'coords-control');
      div.style.background = 'rgba(15, 15, 35, 0.9)';
      div.style.padding = '5px 10px';
      div.style.borderRadius = '5px';
      div.style.color = '#00ff88';
      div.style.fontSize = '0.8rem';
      div.style.border = '1px solid #00ff88';
      div.innerHTML = 'Move mouse to see coordinates';
      return div;
    };
    coordsControl.addTo(map);

    // Update coordinates on mouse move
    map.on('mousemove', function(e) {
      const coord = e.latlng;
      const coordsDiv = document.querySelector('.coords-control');
      if (coordsDiv) {
        coordsDiv.innerHTML = `Lat: ${coord.lat.toFixed(6)}, Lng: ${coord.lng.toFixed(6)}`;
      }
    });

    // Track map metrics
    map.on('moveend zoomend', () => {
      setMapMetrics({
        zoom: map.getZoom(),
        center: map.getCenter(),
        bounds: map.getBounds()
      });
    });
    
    if (onMapReady) {
      onMapReady(map);
    }
  };

  const switchLayer = (layerType) => {
    setCurrentLayer(layerType);
    
    // Voice feedback
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(`Switched to ${layerConfigs[layerType].name}`);
      utterance.rate = 1.1;
      utterance.volume = 0.6;
      speechSynthesis.speak(utterance);
    }
  };

  // Get available WMS categories for display
  const wmsCategories = wmsService.getCategories();

  return (
    <div className="map-container">
      {isLoading && (
        <div className="map-loading">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛰️</div>
            <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
              Loading Professional GIS Map...
            </div>
            <div style={{ 
              fontSize: '0.9rem', 
              color: '#666', 
              marginTop: '0.5rem' 
            }}>
              Initializing voice commands, WMS layers, and geospatial intelligence
            </div>
          </div>
        </div>
      )}
      
      <LeafletMapContainer
        center={defaultPosition}
        zoom={6}
        style={{ 
          height: '100%', 
          width: '100%',
          filter: voiceStatus === 'listening' ? 'brightness(1.1) saturate(1.2) hue-rotate(10deg)' : 'none',
          transition: 'filter 0.3s ease'
        }}
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
        preferCanvas={true} // Better performance for overlays
      >
        <TileLayer
          url={layerConfigs[currentLayer].url}
          attribution={layerConfigs[currentLayer].attribution}
          maxZoom={layerConfigs[currentLayer].maxZoom || 19}
          subdomains={layerConfigs[currentLayer].subdomains}
        />
        
        <MapEventHandler 
          onMapReady={handleMapReady}
          onLocationUpdate={onLocationUpdate}
          currentLayer={currentLayer}
          activeLayers={activeLayers}
        />
      </LeafletMapContainer>

      {/* Enhanced Layer Switcher */}
      <div className="layer-switcher">
        <div className="layer-switcher-title">Base Map</div>
        <div className="layer-buttons">
          {Object.entries(layerConfigs).map(([key, config]) => (
            <button
              key={key}
              className={`layer-button ${currentLayer === key ? 'active' : ''}`}
              onClick={() => switchLayer(key)}
            >
              {config.name}
            </button>
          ))}
        </div>
      </div>

      {/* WMS Layer Panel */}
      <div className="wms-layer-panel">
        <div className="wms-panel-title">
          🛰️ Data Layers ({activeLayers.size} active)
        </div>
        <div className="wms-categories">
          {wmsCategories.slice(0, 3).map(category => (
            <div key={category.id} className="wms-category">
              <div className="category-name">{category.name}</div>
              <div className="category-layers">
                {category.layers.slice(0, 2).map(layer => (
                  <div 
                    key={layer.id}
                    className={`wms-layer-item ${activeLayers.has(layer.id) ? 'active' : ''}`}
                  >
                    <span className="layer-icon">{layer.icon}</span>
                    <span className="layer-name">{layer.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Map Metrics Display */}
      <div className="map-metrics">
        <div className="metric-item">
          🔍 Zoom: {mapMetrics.zoom}
        </div>
        {mapMetrics.center && (
          <div className="metric-item">
            📍 Center: {mapMetrics.center.lat.toFixed(4)}, {mapMetrics.center.lng.toFixed(4)}
          </div>
        )}
      </div>

      {/* Voice Status Overlay with Enhanced Effects */}
      {voiceStatus === 'listening' && (
        <div className="voice-listening-overlay">
          <div className="listening-indicator">
            <div className="pulse-ring"></div>
            <div className="pulse-ring pulse-ring-2"></div>
            <div className="listening-text">🎤 AI Voice Processing Active</div>
            <div className="listening-subtext">Speak your geospatial command...</div>
          </div>
        </div>
      )}

      {/* Processing Status for Advanced Operations */}
      {voiceStatus === 'processing' && (
        <div className="processing-overlay">
          <div className="processing-indicator">
            <div className="processing-spinner"></div>
            <div className="processing-text">🧠 AI Processing Command...</div>
            <div className="processing-subtext">Analyzing geospatial request</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapContainer;