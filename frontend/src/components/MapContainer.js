import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { wmsService } from "../services/WMSService";
import OfflineMapTools from "./OfflineMapTools"; // Import OfflineMapTools

// Fix for default markers in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const DEFAULT_CENTER = [28.6139, 77.209]; // Default to New Delhi or a global neutral like [51.505, -0.09]
const DEFAULT_ZOOM = 13;

// Custom marker icons (assuming these are defined in your App.css or here)
const createCustomIcon = (
  iconUrl,
  size = [25, 41],
  anchor = [12, 41],
  popupAnchor = [0, -41]
) => {
  return L.icon({
    iconUrl,
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: popupAnchor,
  });
};

const locationIcon = createCustomIcon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png"
);

const searchResultIcon = createCustomIcon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png"
);

const pulsingLocationIcon = L.divIcon({
  className: "pulsing-location-marker", // Ensure this class is defined in App.css
  html: '<div class="pulsing-dot"></div>', // Ensure .pulsing-dot is styled
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Add a custom marker icon for user-added markers
const customMarkerIcon = createCustomIcon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png"
);

const MapContainer = ({
  onMapReady,
  onLocationUpdate,
  voiceStatus,
  activeLayers,
  currentLocation,
  searchResults,
  customMarkers, // New prop for custom markers
  center,
  zoom,
  isLoading,
  isOnline, // Add this prop
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const customMarkersLayerRef = useRef(null); // New layer group for custom markers
  const layerInstancesRef = useRef({});

  // Initialize map instance
  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      try {
        // Ensure we have valid initial values
        const initialMapCenter =
          center &&
          typeof center.lat === "number" &&
          !isNaN(center.lat) &&
          typeof center.lng === "number" &&
          !isNaN(center.lng)
            ? [center.lat, center.lng]
            : DEFAULT_CENTER;

        const initialMapZoom =
          typeof zoom === "number" && !isNaN(zoom) ? zoom : DEFAULT_ZOOM;

        console.log("Initializing map with:", {
          initialMapCenter,
          initialMapZoom,
        });

        const map = L.map(mapRef.current, {
          center: initialMapCenter,
          zoom: initialMapZoom,
        });

        // Add event listeners for error handling
        map.on("error", (event) => {
          console.error("Leaflet map error:", event.error);
        });

        // Base layer - always add one base layer for the map to work
        const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
          minZoom: 3,
        });

        // Handle network errors on the base layer
        baseLayer.on("tileerror", function (error) {
          console.warn("Base layer tile error:", error);
          // If offline, try to use cached tiles from service worker
        });

        baseLayer.addTo(map);

        // Initialize layer groups
        markersLayerRef.current = L.layerGroup().addTo(map);
        customMarkersLayerRef.current = L.layerGroup().addTo(map);

        if (onMapReady) {
          onMapReady(map);
        }

        mapInstanceRef.current = map;

        // Store the base layer so we don't remove it later
        layerInstancesRef.current["baseOsm"] = baseLayer;

        // Emit ready event for other components
        const event = new CustomEvent("mapready", { detail: { map } });
        document.dispatchEvent(event);
      } catch (error) {
        console.error("Error initializing map:", error);
        // Show user-friendly error
        if (mapRef.current) {
          mapRef.current.innerHTML = `
          <div class="map-error">
            <p>Error loading map. Please try again.</p>
            <button onclick="window.location.reload()">Reload</button>
          </div>
        `;
        }
      }
    }

    // Cleanup function when component unmounts
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.off();
          mapInstanceRef.current.remove();
        } catch (error) {
          console.error("Error cleaning up map:", error);
        }
        mapInstanceRef.current = null;
      }

      // Clean up other references
      if (markersLayerRef.current) {
        try {
          markersLayerRef.current.clearLayers();
        } catch (e) {
          console.error("Error clearing markers layer:", e);
        }
      }

      if (customMarkersLayerRef.current) {
        try {
          customMarkersLayerRef.current.clearLayers();
        } catch (e) {
          console.error("Error clearing custom markers layer:", e);
        }
      }

      layerInstancesRef.current = {};
    };
  }, [onMapReady]); // Keep dependencies minimal for initialization

  // Update map view when center or zoom props change
  useEffect(() => {
    if (mapInstanceRef.current) {
      // Only update view if center coordinates are valid numbers
      if (
        center &&
        typeof center.lat === "number" &&
        !isNaN(center.lat) &&
        typeof center.lng === "number" &&
        !isNaN(center.lng) &&
        typeof zoom === "number"
      ) {
        mapInstanceRef.current.setView([center.lat, center.lng], zoom);
      } else {
        console.warn("Invalid map coordinates or zoom:", { center, zoom });
        // If invalid coordinates are provided, use the default
        if (
          DEFAULT_CENTER &&
          !isNaN(DEFAULT_CENTER[0]) &&
          !isNaN(DEFAULT_CENTER[1])
        ) {
          mapInstanceRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        }
      }
    }
  }, [center, zoom]);

  // Handle user location updates
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !currentLocation)
      return;

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;

    // Clear existing location markers (ones with locationMarker: true option)
    markersLayer.eachLayer((layer) => {
      if (layer.options.locationMarker) {
        markersLayer.removeLayer(layer);
      }
    });

    // Add location marker
    const marker = L.marker([currentLocation.lat, currentLocation.lng], {
      icon: voiceStatus === "listening" ? pulsingLocationIcon : locationIcon,
      locationMarker: true, // Custom option to identify this marker
      zIndexOffset: 1000,
    }).addTo(markersLayer);

    marker.bindPopup("<b>Your Location</b>");

    // Add accuracy circle if available
    if (currentLocation.accuracy) {
      const circle = L.circle([currentLocation.lat, currentLocation.lng], {
        radius: currentLocation.accuracy,
        color: "#3388ff",
        fillColor: "#3388ff",
        fillOpacity: 0.1,
        weight: 1,
        locationMarker: true, // Custom option to identify this circle
      }).addTo(markersLayer);
    }
  }, [currentLocation, voiceStatus]);

  // Update search results markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const markersLayer = markersLayerRef.current;

    // Clear existing search result markers (ones without locationMarker: true)
    markersLayer.eachLayer((layer) => {
      if (!layer.options.locationMarker) {
        markersLayer.removeLayer(layer);
      }
    });

    // Add markers for search results
    if (searchResults && searchResults.length > 0) {
      searchResults.forEach((result, index) => {
        if (result.lat && result.lng) {
          const marker = L.marker([result.lat, result.lng], {
            icon: searchResultIcon,
          }).addTo(markersLayer);

          let popupContent = `<div class="search-result-popup"><h3>${
            result.name || "Search Result"
          }</h3>`;
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

  // Handle custom markers
  useEffect(() => {
    if (!mapInstanceRef.current || !customMarkersLayerRef.current) return;

    const layerGroup = customMarkersLayerRef.current;
    layerGroup.clearLayers(); // Clear previous custom markers

    if (customMarkers && customMarkers.length > 0) {
      customMarkers.forEach((markerInfo) => {
        if (markerInfo.lat && markerInfo.lng) {
          const marker = L.marker([markerInfo.lat, markerInfo.lng], {
            icon: customMarkerIcon,
            customMarker: true, // Option to identify these markers
          }).addTo(layerGroup);

          marker.bindPopup(`
            <div class="custom-marker-popup">
              <h3>${markerInfo.name || "Custom Marker"}</h3>
              <p>Lat: ${markerInfo.lat.toFixed(
                5
              )}, Lng: ${markerInfo.lng.toFixed(5)}</p>
              ${
                markerInfo.description ? `<p>${markerInfo.description}</p>` : ""
              }
            </div>
          `);
        }
      });
    }
  }, [customMarkers]);

  // Update WMS layers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    const currentLayerInstances = layerInstancesRef.current;
    const allLayers = wmsService.getAllLayers();

    // For debugging - log active layers
    console.log("Active layers:", Array.from(activeLayers));

    allLayers.forEach((layerConfig) => {
      const layerId = layerConfig.id;
      const isActive = activeLayers.has(layerId);
      const existingLayer = currentLayerInstances[layerId];

      console.log(
        `Layer ${layerId}: active=${isActive}, exists=${!!existingLayer}`
      );

      try {
        if (isActive && !existingLayer) {
          // Add layer
          let newLayer;

          if (layerConfig.url) {
            if (layerConfig.isWMS) {
              newLayer = L.tileLayer.wms(layerConfig.url, {
                layers: layerConfig.layers,
                format: layerConfig.format || "image/png",
                transparent:
                  layerConfig.transparent !== undefined
                    ? layerConfig.transparent
                    : true,
                attribution: layerConfig.attribution || "",
                zIndex: layerConfig.zIndex || 10,
              });
            } else {
              newLayer = L.tileLayer(layerConfig.url, {
                attribution: layerConfig.attribution || "",
                maxZoom: layerConfig.maxZoom || 19,
                minZoom: layerConfig.minZoom || 1,
                zIndex: layerConfig.zIndex || 10,
              });
            }

            if (newLayer) {
              newLayer.addTo(map);
              currentLayerInstances[layerId] = newLayer;
              console.log(`Added layer: ${layerId}`);
            }
          } else {
            console.warn(`Cannot add layer ${layerId}: missing URL`);
          }
        } else if (!isActive && existingLayer) {
          // Remove layer
          map.removeLayer(existingLayer);
          delete currentLayerInstances[layerId];
          console.log(`Removed layer: ${layerId}`);
        }
      } catch (error) {
        console.error(`Error handling layer ${layerId}:`, error);
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
    map.on("locationfound", handleLocationFound);
    // Example: map.locate({ setView: true, maxZoom: 16 }); // To trigger location finding

    return () => {
      map.off("locationfound", handleLocationFound);
    };
  }, [onLocationUpdate]);

  // Add a new effect to handle offline tile errors
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Add event listener for tile load errors
    const handleTileError = (event) => {
      // If offline, handle gracefully
      if (!isOnline) {
        const tile = event.tile;
        // Apply a faded style to indicate offline tile
        tile.style.opacity = "0.5";
        tile.style.outline = "1px solid #ccc";

        // Add an indicator to show this is an offline tile
        const parent = tile.parentNode;
        if (parent && !parent.querySelector(".offline-tile-indicator")) {
          const indicator = document.createElement("div");
          indicator.className = "offline-tile-indicator";
          indicator.innerHTML = "⚠️";
          indicator.title = "Tile not available offline";
          parent.appendChild(indicator);
        }
      }
    };

    // Listen for tile errors globally
    document.addEventListener("tileerror", handleTileError);

    return () => {
      document.removeEventListener("tileerror", handleTileError);
    };
  }, [isOnline]);

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
        style={{ width: "100%", height: "100%" }}
        aria-label="Interactive map"
        role="application"
      />
      {/* Add Offline Map Tools */}
      <OfflineMapTools map={mapInstanceRef.current} isOnline={isOnline} />
    </div>
  );
};

export default MapContainer;
