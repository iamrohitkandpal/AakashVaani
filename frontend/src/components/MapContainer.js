import React, { useEffect, useRef } from 'react';
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

const DEFAULT_CENTER = [28.6139, 77.209]; // Default to New Delhi or a global neutral like [51.505, -0.09]
const DEFAULT_ZOOM = 13;

// Custom marker icons (assuming these are defined in your App.css or here)
const createCustomIcon = (iconUrl, size = [25, 41], anchor = [12, 41], popupAnchor = [0, -41]) => {
  return L.icon({
    iconUrl,
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: popupAnchor
  });
};

const locationIcon = createCustomIcon(
  'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png'
);

const searchResultIcon = createCustomIcon(
  'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png'
);

const pulsingLocationIcon = L.divIcon({
  className: 'pulsing-location-marker', // Ensure this class is defined in App.css
  html: '<div class="pulsing-dot"></div>', // Ensure .pulsing-dot is styled
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});


const MapContainer = ({
  onMapReady,
  onLocationUpdate,
  voiceStatus,
  activeLayers,
  currentLocation,
  searchResults,
  center,
  zoom,
  isLoading
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const layerInstancesRef = useRef({});
  // Removed 'initialized' state, mapInstanceRef.current will serve this purpose

  // Initialize map instance
  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      const initialMapCenter = center || DEFAULT_CENTER;
      const initialMapZoom = typeof zoom === 'number' ? zoom : DEFAULT_ZOOM;

      const map = L.map(mapRef.current, {
          // prefer passing options here rather than chaining setView immediately
          center: initialMapCenter,
          zoom: initialMapZoom,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        minZoom: 3
      }).addTo(map);

      mapInstanceRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);

      if (onMapReady) {
        onMapReady(map);
      }
    }

    // Cleanup function to destroy map instance when component unmounts
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (markersLayerRef.current) {
        markersLayerRef.current.remove();
        markersLayerRef.current = null;
      }
      layerInstancesRef.current = {};
    };
  }, [onMapReady]); // Initialize only once. onMapReady is a prop.

  // Update map view when center or zoom props change
  useEffect(() => {
    if (mapInstanceRef.current && center && typeof zoom === 'number') {
      mapInstanceRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  // Handle user location updates
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !currentLocation) return;

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;

    // Clear existing location markers (ones with locationMarker: true option)
    markersLayer.eachLayer(layer => {
      if (layer.options.locationMarker) {
        markersLayer.removeLayer(layer);
      }
    });

    // Add location marker
    const marker = L.marker([currentLocation.lat, currentLocation.lng], {
      icon: voiceStatus === 'listening' ? pulsingLocationIcon : locationIcon,
      locationMarker: true, // Custom option to identify this marker
      zIndexOffset: 1000
    }).addTo(markersLayer);

    marker.bindPopup('<b>Your Location</b>');

    // Add accuracy circle if available
    if (currentLocation.accuracy) {
      const circle = L.circle([currentLocation.lat, currentLocation.lng], {
        radius: currentLocation.accuracy,
        color: '#3388ff',
        fillColor: '#3388ff',
        fillOpacity: 0.1,
        weight: 1,
        locationMarker: true // Custom option to identify this circle
      }).addTo(markersLayer);
    }
  }, [currentLocation, voiceStatus]);

  // Update search results markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const markersLayer = markersLayerRef.current;

    // Clear existing search result markers (ones without locationMarker: true)
    markersLayer.eachLayer(layer => {
      if (!layer.options.locationMarker) {
        markersLayer.removeLayer(layer);
      }
    });

    // Add markers for search results
    if (searchResults && searchResults.length > 0) {
      searchResults.forEach((result, index) => {
        if (result.lat && result.lng) {
          const marker = L.marker([result.lat, result.lng], {
            icon: searchResultIcon
          }).addTo(markersLayer);

          let popupContent = `<div class="search-result-popup"><h3>${result.name || 'Search Result'}</h3>`;
          if (result.type) {
            popupContent += `<p class="result-type">${result.type}</p>`;
          }
          if (result.distance) {
            popupContent += `<p class="result-distance">${
              result.distance < 1
                ? `${Math.round(result.distance * 1000)}m`
                : `${result.distance.toFixed(1)}km`
            } away</p>`;
          }
          popupContent += `</div>`;
          marker.bindPopup(popupContent);

          if (index === 0 && searchResults.length === 1) {
            marker.openPopup();
          }
        }
      });
    }
  }, [searchResults]);

  // Update WMS layers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    const currentLayerInstances = layerInstancesRef.current;
    const allLayers = wmsService.getAllLayers();

    allLayers.forEach(layerConfig => {
      const layerId = layerConfig.id;
      const isActive = activeLayers.has(layerId);
      const existingLayer = currentLayerInstances[layerId];

      if (isActive && !existingLayer) {
        // Add layer
        const newLayer = L.tileLayer.wms(layerConfig.url, {
          layers: layerConfig.layers,
          format: layerConfig.format || 'image/png',
          transparent: layerConfig.transparent !== undefined ? layerConfig.transparent : true,
          attribution: layerConfig.attribution || '',
          zIndex: layerConfig.zIndex || 10 // Ensure overlays are above base tiles
        }).addTo(map);
        currentLayerInstances[layerId] = newLayer;
      } else if (!isActive && existingLayer) {
        // Remove layer
        map.removeLayer(existingLayer);
        delete currentLayerInstances[layerId];
      }
    });
    layerInstancesRef.current = currentLayerInstances;
  }, [activeLayers]);


  // Add map event listeners (example for location found by map.locate())
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const handleLocationFound = (e) => {
      if (onLocationUpdate) {
        onLocationUpdate({
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          accuracy: e.accuracy,
        });
      }
    };
    map.on('locationfound', handleLocationFound);
    // Example: map.locate({ setView: true, maxZoom: 16 }); // To trigger location finding

    return () => {
      map.off('locationfound', handleLocationFound);
    };
  }, [onLocationUpdate]);

  return (
    <div className="map-container">
      {isLoading && (
        <div className="map-loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading map data...</p>
        </div>
      )}
      <div
        ref={mapRef}
        className="map-view"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default MapContainer;