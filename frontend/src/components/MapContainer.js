import React, { useEffect, useRef, useState } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Map event handler component
const MapEventHandler = ({ onMapReady, onLocationUpdate }) => {
  const map = useMap();

  useEffect(() => {
    if (map && onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

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

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          onLocationUpdate(location);
          
          // Add a marker for current location
          const currentLocationMarker = L.marker([location.lat, location.lng], {
            icon: L.divIcon({
              className: 'current-location-marker',
              html: '📍',
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            })
          }).addTo(map);
          
          currentLocationMarker.bindPopup('📍 Your Current Location');
        },
        (error) => {
          console.warn('Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000
        }
      );
    }
  }, [map, onLocationUpdate]);

  return null;
};

const MapContainer = ({ onMapReady, onLocationUpdate, voiceStatus }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentLayer, setCurrentLayer] = useState('street');
  const mapRef = useRef(null);

  const defaultPosition = [28.6139, 77.2090]; // New Delhi, India as default

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
    }
  };

  const handleMapReady = (map) => {
    setIsLoading(false);
    mapRef.current = map;
    
    // Add some initial styling
    map.attributionControl.setPrefix('🗺️ Geo Voice Navigator');
    
    if (onMapReady) {
      onMapReady(map);
    }
  };

  const switchLayer = (layerType) => {
    setCurrentLayer(layerType);
  };

  return (
    <div className="map-container">
      {isLoading && (
        <div className="map-loading">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🗺️</div>
            <div>Loading interactive map...</div>
            <div style={{ 
              fontSize: '0.9rem', 
              color: '#666', 
              marginTop: '0.5rem' 
            }}>
              Voice commands will be available once loaded
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
          filter: voiceStatus === 'listening' ? 'brightness(1.1) saturate(1.2)' : 'none',
          transition: 'filter 0.3s ease'
        }}
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
      >
        <TileLayer
          url={layerConfigs[currentLayer].url}
          attribution={layerConfigs[currentLayer].attribution}
          maxZoom={19}
        />
        
        <MapEventHandler 
          onMapReady={handleMapReady}
          onLocationUpdate={onLocationUpdate}
        />
      </LeafletMapContainer>

      {/* Layer Switcher */}
      <div className="layer-switcher">
        <div className="layer-switcher-title">Map View</div>
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

      {/* Voice Status Overlay */}
      {voiceStatus === 'listening' && (
        <div className="voice-listening-overlay">
          <div className="listening-indicator">
            <div className="pulse-ring"></div>
            <div className="listening-text">🎤 Listening for commands...</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapContainer;