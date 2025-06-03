import React, { useEffect, useRef, useState, useCallback, memo, useMemo } from 'react';
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
const MapEventHandler = memo(({ onMapReady, onLocationUpdate, currentLayer, activeLayers }) => {
  const map = useMap();
  const wmsLayersRef = useRef(new Map());

  useEffect(() => {
    if (map && onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  // Handle WMS layer changes efficiently
  useEffect(() => {
    if (!map) return;

    const currentLayers = new Set(wmsLayersRef.current.keys());
    
    // Find layers to remove
    currentLayers.forEach(layerId => {
      if (!activeLayers.has(layerId)) {
        const layer = wmsLayersRef.current.get(layerId);
        if (layer) {
          map.removeLayer(layer);
          wmsLayersRef.current.delete(layerId);
        }
      }
    });

    // Add new layers
    activeLayers.forEach(layerId => {
      if (!wmsLayersRef.current.has(layerId)) {
        const layerConfig = wmsService.getLayer(layerId);
        
        if (layerConfig) {
          try {
            let leafletLayer = null;
            
            // Make sure URL is defined before proceeding
            if (!layerConfig.url) {
              console.warn(`WMS layer ${layerId} has no URL defined`);
              return;
            }
            
            // Handle different layer types appropriately
            if (layerConfig.url.includes('{z}')) {
              // TileLayer format
              const options = {
                attribution: layerConfig.attribution || '',
                maxZoom: layerConfig.maxZoom || 18,
                opacity: 0.7
              };
              
              // Only add subdomains if they are explicitly defined in the config
              if (layerConfig.subdomains && Array.isArray(layerConfig.subdomains)) {
                options.subdomains = layerConfig.subdomains;
              }
              
              leafletLayer = L.tileLayer(layerConfig.url, options);
            } else if (layerConfig.layers) {
              // WMS layer format
              leafletLayer = L.tileLayer.wms(layerConfig.url, {
                layers: layerConfig.layers,
                format: layerConfig.format || 'image/png',
                transparent: layerConfig.transparent !== false, // Default to true
                attribution: layerConfig.attribution || '',
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

  // Map event handling
  useMapEvents({
    click(e) {
      // Handle map clicks if needed
      console.log(`Map clicked at: ${e.latlng.lat}, ${e.latlng.lng}`);
    },
    zoomend() {
      // Handle zoom events if needed
      const currentZoom = map.getZoom();
      console.log(`Map zoom changed to: ${currentZoom}`);
    },
    moveend() {
      // Handle move events if needed
      const center = map.getCenter();
      console.log(`Map moved to: ${center.lat}, ${center.lng}`);
    }
  });

  // Enhanced geolocation with better accuracy and error handling
  useEffect(() => {
    if (navigator.geolocation && map && onLocationUpdate) {
      // Default location for India if geolocation fails
      const defaultLocation = { lat: 20.5937, lng: 78.9629, accuracy: 1000 };
      
      // Set a timeout for geolocation
      const geoTimeout = setTimeout(() => {
        console.log("Geolocation timed out, using default location");
        onLocationUpdate(defaultLocation);
        
        // Add default location marker
        const marker = L.marker([defaultLocation.lat, defaultLocation.lng], {
          icon: L.divIcon({
            className: 'default-location-marker',
            html: '📍',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          })
        }).addTo(map);
        marker.bindPopup('Default Location (India)').openPopup();
      }, 5000); // 5 seconds timeout
      
      // Try to get actual location
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          // Clear the timeout since we got a position
          clearTimeout(geoTimeout);
          
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          onLocationUpdate(location);
          
          // Add/update current location marker
          if (map._currentLocationMarker) {
            map.removeLayer(map._currentLocationMarker);
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
          // Clear the timeout since we got an error
          clearTimeout(geoTimeout);
          console.warn('Geolocation error:', error);
          
          // Use default location on error
          onLocationUpdate(defaultLocation);
          
          // Add default location marker
          const marker = L.marker([defaultLocation.lat, defaultLocation.lng], {
            icon: L.divIcon({
              className: 'default-location-marker',
              html: '📍',
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            })
          }).addTo(map);
          marker.bindPopup('Default Location (India)').openPopup();
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000 // Cache position for 1 minute
        }
      );
      
      return () => {
        clearTimeout(geoTimeout);
        navigator.geolocation.clearWatch(watchId);
      };
    }
  }, [map, onLocationUpdate]);

  return null;
});

// Main MapContainer component
const MapContainer = memo(({ onMapReady, onLocationUpdate, voiceStatus, activeLayers = new Set(), currentLocation }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentLayer, setCurrentLayer] = useState('street');
  const [mapMetrics, setMapMetrics] = useState({
    zoom: 6,
    center: null,
    bounds: null
  });
  const mapRef = useRef(null);

  // Default center position (India)
  const defaultPosition = [20.5937, 78.9629];
  
  // Layer configurations
  const layerConfigs = useMemo(() => ({
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      name: 'Street Map',
      subdomains: ['a', 'b', 'c']
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics',
      name: 'Satellite'
    },
    terrain: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '© OpenTopoMap',
      name: 'Terrain',
      subdomains: ['a', 'b', 'c']
    },
    dark: {
      url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
      attribution: '© CartoDB, © OpenStreetMap',
      name: 'Dark Mode',
      subdomains: ['a', 'b', 'c', 'd']
    }
  }), []);

  // Callback for handling map ready event
  const handleMapReady = useCallback((map) => {
    setIsLoading(false);
    mapRef.current = map;
    
    // Add scale control
    L.control.scale({
      metric: true,
      imperial: false,
      position: 'bottomleft'
    }).addTo(map);

    // Add coordinates display
    const coordsControl = L.control({ position: 'bottomright' });
    coordsControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'coords-control');
      div.style.background = 'rgba(13, 31, 61, 0.8)';
      div.style.padding = '4px 8px';
      div.style.borderRadius = '4px';
      div.style.color = '#3399ff';
      div.style.fontSize = '0.7rem';
      div.style.border = '1px solid rgba(51, 153, 255, 0.3)';
      div.innerHTML = 'Hover to see coordinates';
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

    // Track map metrics for UI display
    map.on('moveend zoomend', () => {
      setMapMetrics({
        zoom: map.getZoom(),
        center: map.getCenter(),
        bounds: map.getBounds()
      });
    });
    
    // Add the setBaseLayer method to the map instance
    map.setBaseLayer = function(layerType) {
      if (layerConfigs[layerType]) {
        setCurrentLayer(layerType);
      }
    };
    
    if (onMapReady) {
      onMapReady(map);
    }
  }, [onMapReady, layerConfigs]);

  // Handle layer switching
  const switchLayer = useCallback((layerType) => {
    setCurrentLayer(layerType);
  }, []);

  // Get available WMS categories
  const wmsCategories = useMemo(() => {
    return wmsService.getCategories ? wmsService.getCategories().slice(0, 2) : [];
  }, []);

  return (
    <div className="map-container">
      {isLoading && (
        <div className="map-loading">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛰️</div>
            <div style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#fff' }}>
              Loading Map...
            </div>
            <div style={{ 
              fontSize: '0.8rem', 
              color: '#a0aec0', 
              marginTop: '0.5rem' 
            }}>
              Initializing geospatial services
            </div>
          </div>
        </div>
      )}
      
      <LeafletMapContainer
        center={defaultPosition}
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
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

      {/* Layer Switcher */}
      <div className="layer-switcher">
        <div className="layer-switcher-title">Base Map</div>
        <div className="layer-buttons">
          {Object.entries(layerConfigs).map(([key, config]) => (
            <button
              key={key}
              className={`layer-button ${currentLayer === key ? 'active' : ''}`}
              onClick={() => switchLayer(key)}
              aria-label={`Switch to ${config.name}`}
            >
              {config.name}
            </button>
          ))}
        </div>
      </div>

      {/* Voice status overlay */}
      {voiceStatus === 'listening' && (
        <div className="voice-listening-overlay">
          <div className="voice-listening-indicator">
            <div className="voice-pulse">
              <span>🎤</span>
            </div>
            <div>Listening...</div>
          </div>
        </div>
      )}
    </div>
  );
});

export default MapContainer;