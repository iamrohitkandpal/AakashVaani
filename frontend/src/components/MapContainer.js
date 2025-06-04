import React, { useState, useEffect, useRef } from 'react';
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

const DEFAULT_CENTER = [28.6139, 77.209]; // New Delhi coordinates
const DEFAULT_ZOOM = 13;

// Custom marker icons
const createCustomIcon = (iconUrl, size = [25, 41], anchor = [12, 41]) => {
  return L.icon({
    iconUrl,
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: [0, -41]
  });
};

const locationIcon = createCustomIcon(
  'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png'
);

const searchResultIcon = createCustomIcon(
  'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png'
);

const pulsingLocationIcon = L.divIcon({
  className: 'pulsing-location-marker',
  html: '<div class="pulsing-dot"></div>',
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
  const [initialized, setInitialized] = useState(false);
  
  // Initialize map
  useEffect(() => {
    if (mapRef.current && !initialized) {
      const initialCenter = center || DEFAULT_CENTER;
      const initialZoom = zoom || DEFAULT_ZOOM;
      
      // Create map instance
      const mapInstance = L.map(mapRef.current).setView(initialCenter, initialZoom);
      
      // Add base layer (OpenStreetMap)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(mapInstance);
      
      // Create a markers layer
      const markersLayer = L.layerGroup().addTo(mapInstance);
      
      // Store references
      mapInstanceRef.current = mapInstance;
      markersLayerRef.current = markersLayer;
      
      // Call callback with map instance
      if (onMapReady) {
        onMapReady(mapInstance);
      }
      
      setInitialized(true);
      
      // Cleanup function
      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }
  }, [onMapReady, initialized, center, zoom]);
  
  // Update map center and zoom when props change
  useEffect(() => {
    if (mapInstanceRef.current && center && zoom) {
      mapInstanceRef.current.setView([center.lat, center.lng], zoom, {
        animate: true,
        duration: 1
      });
    }
  }, [center, zoom]);
  
  // Handle user location updates
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !currentLocation) return;
    
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    
    // Clear existing location markers
    markersLayer.eachLayer(layer => {
      if (layer.options.locationMarker) {
        markersLayer.removeLayer(layer);
      }
    });
    
    // Add location marker
    const marker = L.marker([currentLocation.lat, currentLocation.lng], {
      icon: voiceStatus === 'listening' ? pulsingLocationIcon : locationIcon,
      locationMarker: true,
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
        locationMarker: true
      }).addTo(markersLayer);
    }
  }, [currentLocation, voiceStatus]);
  
  // Update search results markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    
    const markersLayer = markersLayerRef.current;
    
    // Clear existing search result markers
    markersLayer.eachLayer(layer => {
      if (layer.options.searchResultMarker) {
        markersLayer.removeLayer(layer);
      }
    });
    
    // Add markers for search results
    if (searchResults && searchResults.length > 0) {
      searchResults.forEach((result, index) => {
        if (typeof result.lat === 'number' && typeof result.lng === 'number') {
          const marker = L.marker([result.lat, result.lng], {
            icon: searchResultIcon,
            searchResultMarker: true,
            zIndexOffset: 500
          }).addTo(markersLayer);
          
          // Prepare popup content
          let popupContent = `<div class="search-result-popup">`;
          popupContent += `<h3>${result.name || 'Location'}</h3>`;
          
          if (result.address) {
            const address = typeof result.address === 'string' 
              ? result.address 
              : Object.values(result.address).filter(Boolean).join(', ');
            
            popupContent += `<p>${address}</p>`;
          }
          
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
          
          // Add popup to marker
          marker.bindPopup(popupContent);
          
          // Open popup for first result
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
    
    // Get all available layers
    const allLayers = wmsService.getAllLayers();
    
    // Check each layer against active layers Set
    allLayers.forEach(layer => {
      // Layer should be active
      if (activeLayers.has(layer.id)) {
        // Layer is not added yet
        if (!currentLayerInstances[layer.id]) {
          // Create and add WMS layer
          const wmsLayer = L.tileLayer.wms(layer.url, {
            layers: layer.name,
            format: 'image/png',
            transparent: true,
            attribution: layer.attribution || 'WMS Layer'
          });
          
          // Add to map and store reference
          wmsLayer.addTo(map);
          currentLayerInstances[layer.id] = wmsLayer;
        }
      } 
      // Layer should not be active
      else if (currentLayerInstances[layer.id]) {
        // Remove layer from map
        map.removeLayer(currentLayerInstances[layer.id]);
        delete currentLayerInstances[layer.id];
      }
    });
    
    // Update reference
    layerInstancesRef.current = currentLayerInstances;
  }, [activeLayers]);
  
  // Add map event listeners
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    const map = mapInstanceRef.current;
    
    // Track user location updates
    const handleLocationFound = (e) => {
      const { lat, lng, accuracy } = e.latlng;
      if (onLocationUpdate) {
        onLocationUpdate({ 
          lat, 
          lng, 
          accuracy: e.accuracy 
        });
      }
    };
    
    map.on('locationfound', handleLocationFound);
    
    // Cleanup event listeners
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