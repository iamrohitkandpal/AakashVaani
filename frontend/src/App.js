import React, { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import MapContainer from "./components/MapContainer";
import VoiceNavigator from "./components/VoiceNavigator";
import VoiceCommandLog from "./components/VoiceCommandLog";
import VoiceStatusIndicator from "./components/VoiceStatusIndicator";
import { wmsService } from "./services/WMSService";
import { poiService } from "./services/POIService";
import { geocodingService } from "./services/GeocodingService";
import DebugPanel from "./components/DebugPanel";

function App() {
  const [voiceCommands, setVoiceCommands] = useState([]);
  const [mapInstance, setMapInstance] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [activeLayers, setActiveLayers] = useState(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [mapCenter, setMapCenter] = useState({ lat: 28.6139, lng: 77.209 }); // Default to New Delhi
  const [mapZoom, setMapZoom] = useState(13);
  const [isLoading, setIsLoading] = useState(false);
  const [poiCategories, setPoiCategories] = useState([]);
  const [customMarkers, setCustomMarkers] = useState([]); // New state for user-added markers
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineNotification, setShowOfflineNotification] = useState(false);
  const [offlineMapAreas, setOfflineMapAreas] = useState([]);

  // On mount, try to get user location
  useEffect(() => {
    if (isInitialized) return;

    const getUserLocation = async () => {
      try {
        setIsLoading(true);

        // Check if geolocation is supported
        if (!navigator.geolocation) {
          console.error("Geolocation is not supported by this browser");
          setCurrentLocation({ lat: 28.6139, lng: 77.209 }); // Default to New Delhi
          setMapCenter({ lat: 28.6139, lng: 77.209 });
          setIsLoading(false);

          // Add a notification for the user
          setVoiceCommands((prev) => [
            {
              type: "info",
              rawCommand:
                "Geolocation is not supported by your browser. Using default location.",
              timestamp: new Date().toISOString(),
              status: "completed",
            },
            ...prev,
          ]);
          return;
        }

        // Use Promise to handle geolocation with better error messaging
        const getPositionPromise = () => {
          return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              resolve,
              (error) => {
                let errorMessage;
                switch (error.code) {
                  case error.PERMISSION_DENIED:
                    errorMessage =
                      "Location access was denied. You can still use the app with a default location.";
                    break;
                  case error.POSITION_UNAVAILABLE:
                    errorMessage =
                      "Location information is unavailable. Using default location.";
                    break;
                  case error.TIMEOUT:
                    errorMessage =
                      "Request to get location timed out. Using default location.";
                    break;
                  default:
                    errorMessage =
                      "An unknown error occurred getting your location. Using default location.";
                }
                reject({ message: errorMessage, originalError: error });
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            );
          });
        };

        try {
          const position = await getPositionPromise();
          const { latitude, longitude } = position.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          setMapCenter({ lat: latitude, lng: longitude });

          // Add success notification
          setVoiceCommands((prev) => [
            {
              type: "info",
              rawCommand: "Location detected successfully.",
              timestamp: new Date().toISOString(),
              status: "completed",
            },
            ...prev,
          ]);
        } catch (geoError) {
          console.error("Error getting location:", geoError);

          // Default to New Delhi if location access is denied
          setCurrentLocation({ lat: 28.6139, lng: 77.209 });
          setMapCenter({ lat: 28.6139, lng: 77.209 });

          // Add user notification about location error
          setVoiceCommands((prev) => [
            {
              type: "error",
              rawCommand: geoError.message,
              timestamp: new Date().toISOString(),
              status: "completed",
            },
            ...prev,
          ]);
        }
      } catch (error) {
        console.error("General location error:", error);
        setCurrentLocation({ lat: 28.6139, lng: 77.209 });
        setMapCenter({ lat: 28.6139, lng: 77.209 });
        setIsLoading(false);
      } finally {
        setIsLoading(false);
      }
    };

    getUserLocation();
    setIsInitialized(true);
  }, [isInitialized]);

  // Fetch POI categories on mount
  useEffect(() => {
    // Use the backend endpoint to fetch categories rather than the client method
    const fetchCategories = async () => {
      try {
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/categories`
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch categories: ${response.status}`);
        }
        const categories = await response.json();
        setPoiCategories(categories);
      } catch (error) {
        console.error("Error fetching POI categories:", error);
        // Fall back to local categories if backend fails
        setPoiCategories(poiService.getCategories());
      }
    };

    fetchCategories();
  }, []);

  // Handle voice command
  const handleVoiceCommand = useCallback(
    (commandObj) => {
      const commandWithTimestamp = {
        ...commandObj,
        timestamp: commandObj.timestamp || new Date().toISOString(),
        status: "processing",
      };

      // Limit to only 3 most recent commands
      setVoiceCommands((prevCommands) => [
        commandWithTimestamp,
        ...prevCommands.slice(0, 2), // Keep only 2 previous commands plus the new one
      ]);

      // Log the command for debugging
      console.log("Voice command received:", commandObj);

      // Show feedback that something was understood
      if (commandObj.type !== "unknown" && commandObj.type !== "unknown_tf") {
        showCommandFeedback(
          `Processing: ${commandObj.rawCommand}`,
          "processing"
        );
      }

      switch (commandObj.type) {
        case "search":
          handleSearchCommand(commandObj);
          break;
        case "navigate":
          handleNavigationCommand(commandObj);
          break;
        case "layer":
          handleLayerCommand(commandObj);
          break;
        case "zoom":
          handleZoomCommand(commandObj);
          break;
        case "reset":
          handleResetCommand();
          break;
        case "help":
          setShowHelp(true);
          break;
        case "location_query":
          if (currentLocation) {
            setMapCenter({
              lat: currentLocation.lat,
              lng: currentLocation.lng,
            });
            setMapZoom(16);
          } else {
            updateCommandStatus(
              commandWithTimestamp.timestamp,
              "error",
              "Current location not available yet."
            );
          }
          break;
        case "pan":
          if (mapInstance) {
            const offset = mapInstance.getSize().y / 4;
            let panBy;
            switch (commandObj.direction) {
              case "left":
                panBy = [-offset, 0];
                break;
              case "right":
                panBy = [offset, 0];
                break;
              case "up":
                panBy = [0, -offset];
                break;
              case "down":
                panBy = [0, offset];
                break;
              default:
                break;
            }
            if (panBy) mapInstance.panBy(panBy);
          }
          break;
        case "add_marker":
          handleAddMarkerCommand(commandObj);
          break;
        default:
          console.log("Unknown command type:", commandObj.type, commandObj);
          updateCommandStatus(
            commandWithTimestamp.timestamp,
            "error",
            "Unknown command type"
          );
          showCommandFeedback(
            `Sorry, I didn't understand "${commandObj.rawCommand}"`,
            "error"
          );
      }
    },
    [mapInstance, currentLocation]
  );

  // New handler for add marker commands
  const handleAddMarkerCommand = async (commandObj) => {
    let lat, lng, name;
    name = `Marker @ ${new Date().toLocaleTimeString()}`;

    if (commandObj.locationQuery) {
      // If a location is specified in the command, geocode it
      setIsLoading(true);
      try {
        const results = await geocodingService.search(commandObj.locationQuery);
        if (results && results.length > 0) {
          lat = results[0].lat;
          lng = results[0].lng;
          name = results[0].name || commandObj.locationQuery;

          // Update command status
          updateCommandStatus(commandObj.timestamp, "completed");
        } else {
          updateCommandStatus(
            commandObj.timestamp,
            "error",
            `Could not find location: ${commandObj.locationQuery}`
          );
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error("Error geocoding for add marker:", error);
        updateCommandStatus(
          commandObj.timestamp,
          "error",
          "Failed to geocode location for marker."
        );
        setIsLoading(false);
        return;
      } finally {
        setIsLoading(false);
      }
    } else if (mapInstance) {
      // Default to current map center if no location specified
      const center = mapInstance.getCenter();
      lat = center.lat;
      lng = center.lng;

      // Update command status
      updateCommandStatus(commandObj.timestamp, "completed");
    } else if (currentLocation) {
      // Fallback to user's current location
      lat = currentLocation.lat;
      lng = currentLocation.lng;
      name = "My Location";

      // Update command status
      updateCommandStatus(commandObj.timestamp, "completed");
    } else {
      updateCommandStatus(
        commandObj.timestamp,
        "error",
        "Map or location not available to add marker."
      );
      return;
    }

    if (
      typeof lat === "number" &&
      typeof lng === "number" &&
      !isNaN(lat) &&
      !isNaN(lng)
    ) {
      const newMarker = { lat, lng, name, id: `custom-${Date.now()}` };
      setCustomMarkers((prevMarkers) => [...prevMarkers, newMarker]);

      // Optionally, pan map to the new marker
      setMapCenter({ lat, lng });
      setMapZoom(Math.max(mapZoom, 15)); // Zoom in if necessary
    } else {
      updateCommandStatus(
        commandObj.timestamp,
        "error",
        "Invalid coordinates for marker."
      );
    }
  };

  // Handle search command
  const handleSearchCommand = async (commandObj) => {
    if (!commandObj.query) {
      updateCommandStatus(commandObj.timestamp, "error", "No query provided");
      return;
    }
    setIsLoading(true);
    try {
      const results = await geocodingService.smartSearch(
        commandObj.query,
        currentLocation
          ? { lat: currentLocation.lat, lng: currentLocation.lng }
          : {}
      );
      setSearchResults(results);
      if (results && results.length > 0) {
        const firstResult = results[0];
        // Ensure lat and lng are valid numbers
        if (
          firstResult &&
          typeof firstResult.lat === "number" &&
          !isNaN(firstResult.lat) &&
          typeof firstResult.lng === "number" &&
          !isNaN(firstResult.lng)
        ) {
          setMapCenter({ lat: firstResult.lat, lng: firstResult.lng });
          setMapZoom(15);
          updateCommandStatus(commandObj.timestamp, "completed");
        } else {
          console.warn(
            "First search result lacks valid coordinates:",
            firstResult
          );
          updateCommandStatus(
            commandObj.timestamp,
            "error",
            "Search successful, but no map location found for the top result."
          );
        }
      } else {
        updateCommandStatus(
          commandObj.timestamp,
          "error",
          "No results found for your search."
        );
      }
    } catch (error) {
      console.error("Search error:", error);
      updateCommandStatus(commandObj.timestamp, "error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle navigation command
  const handleNavigationCommand = async (commandObj) => {
    if (!commandObj.destination) return;

    setIsLoading(true);
    try {
      const results = await geocodingService.search(commandObj.destination);
      if (results && results.length > 0) {
        const destination = results[0];

        // Set map view to destination
        setMapCenter({ lat: destination.lat, lng: destination.lng });
        setMapZoom(16);

        // If we had routing functionality, it would go here
        setSearchResults([destination]);
      }
    } catch (error) {
      console.error("Navigation error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle layer command
  const handleLayerCommand = (commandObj) => {
    console.log("Layer command received:", commandObj);

    if (!commandObj.layer) {
      console.error("Missing layer in command:", commandObj);
      updateCommandStatus(commandObj.timestamp, "error", "No layer specified");
      return;
    }

    const layerId = wmsService.detectLayerFromCommand(commandObj.layer);
    console.log(`Detected layer ID: ${layerId} for "${commandObj.layer}"`);

    if (!layerId) {
      console.error(`No layer found matching "${commandObj.layer}"`);
      // Show available layers for debugging
      const availableLayers = wmsService.getAllLayers().map((l) => l.name);
      console.log("Available layers:", availableLayers);
      updateCommandStatus(
        commandObj.timestamp,
        "error",
        `Layer "${commandObj.layer}" not found. Try one of: ${availableLayers
          .slice(0, 5)
          .join(", ")}...`
      );
      return;
    }

    if (commandObj.action === "show") {
      console.log(`Adding layer: ${layerId}`);
      setActiveLayers((prev) => {
        const newLayers = new Set([...prev]);
        newLayers.add(layerId);
        return newLayers;
      });
      updateCommandStatus(commandObj.timestamp, "completed", null);
    } else if (commandObj.action === "hide") {
      console.log(`Removing layer: ${layerId}`);
      setActiveLayers((prev) => {
        const newLayers = new Set([...prev]);
        newLayers.delete(layerId);
        return newLayers;
      });
      updateCommandStatus(commandObj.timestamp, "completed", null);
    } else if (commandObj.action === "toggle") {
      setActiveLayers((prev) => {
        const newLayers = new Set([...prev]);
        const hasLayer = newLayers.has(layerId);
        console.log(
          `Toggling layer: ${layerId} (currently ${hasLayer ? "on" : "off"})`
        );

        if (hasLayer) {
          newLayers.delete(layerId);
        } else {
          newLayers.add(layerId);
        }
        return newLayers;
      });
      updateCommandStatus(commandObj.timestamp, "completed", null);
    } else {
      console.error(`Unknown layer action: ${commandObj.action}`);
      updateCommandStatus(
        commandObj.timestamp,
        "error",
        `Unknown action "${commandObj.action}". Try "show", "hide", or "toggle"`
      );
    }
  };

  // Handle zoom command
  const handleZoomCommand = (commandObj) => {
    if (!mapInstance) return;

    if (commandObj.action === "in") {
      const newZoom = Math.min(mapZoom + 1, 18);
      setMapZoom(newZoom);
    } else if (commandObj.action === "out") {
      const newZoom = Math.max(mapZoom - 1, 3);
      setMapZoom(newZoom);
    } else if (commandObj.level) {
      const level = parseInt(commandObj.level, 10);
      if (!isNaN(level) && level >= 3 && level <= 18) {
        setMapZoom(level);
      }
    }
  };

  // Handle reset command
  const handleResetCommand = () => {
    // Reset to current location
    if (currentLocation) {
      setMapCenter(currentLocation);
    }
    setMapZoom(13);
    setActiveLayers(new Set());
    setSearchResults([]);
  };

  // Handle layer change from UI
  const handleLayerChange = (layerId, enabled) => {
    setActiveLayers((prev) => {
      const newLayers = new Set(prev);
      if (enabled) {
        newLayers.add(layerId);
      } else {
        newLayers.delete(layerId);
      }
      return newLayers;
    });
  };

  // Helper to update command status in the log
  const updateCommandStatus = (timestamp, status, errorMessage = null) => {
    setVoiceCommands((prev) =>
      prev.map((cmd) =>
        cmd.timestamp === timestamp
          ? { ...cmd, status: status, error: errorMessage }
          : cmd
      )
    );
  };

  // Update handlePoiCategorySearch to handle errors better
  const handlePoiCategorySearch = (categoryKey) => {
    const category = poiCategories.find((c) => c.key === categoryKey);
    if (!category) {
      console.error(`Category not found: ${categoryKey}`);
      return;
    }
    
    console.log("Searching for POI category:", category);
    
    const timestamp = new Date().toISOString();
    // Create a proper command object with timestamp
    const commandObj = {
      type: "search",
      query: `${category.name} near me`,  // Make the query more specific
      timestamp: timestamp,
    };
    
    // Update voice commands list with initial status
    setVoiceCommands((prev) => [{
      ...commandObj,
      status: "processing",
    }, ...prev.slice(0, 2)]); // Keep only 2 previous commands
    
    // Process the command
    handleSearchCommand(commandObj);
  };

  // Add this useEffect for online/offline detection
  useEffect(() => {
    function handleOnlineStatus() {
      setIsOnline(navigator.onLine);
      setShowOfflineNotification(!navigator.onLine);
      
      // If coming back online, sync any offline data
      if (navigator.onLine) {
        syncOfflineData();
      }
    }
    
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    // Initial status check
    handleOnlineStatus();
    
    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  // Add this function for offline data synchronization
  const syncOfflineData = () => {
    // Check if the browser supports Background Sync API
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        registration.sync.register('sync-saved-searches');
      }).catch(err => console.error('Background sync registration failed:', err));
    } else {
      // Fallback synchronization
      syncOfflineDataManually();
    }
  };

  return (
    <Router>
      <div className="app-container">
        <header className="app-header">
          <div className="header-content">
            <div className="app-title">
              <div className="title-icon">🗺️</div>
              <h1>Aakash Vaani</h1>
              <div className="title-subtitle">Voice-Powered Mapping</div>
            </div>
            <div className="header-controls">
              <button
                className="help-button"
                onClick={() => setShowHelp(!showHelp)}
                aria-expanded={showHelp}
                aria-controls="help-modal"
              >
                <span className="help-button-icon">❓</span>
                <span className="help-button-text">
                  {showHelp ? "Close Help" : "Help"}
                </span>
              </button>
            </div>
          </div>
          <VoiceStatusIndicator status={voiceStatus} />
        </header>

        <main className="main-content">
          <div className="left-panel">
            <div className="panel-container">
              <VoiceNavigator
                onVoiceCommand={handleVoiceCommand}
                onStatusChange={setVoiceStatus}
                mapInstance={mapInstance}
                currentLocation={currentLocation}
                activeLayers={activeLayers}
                // onLayerChange={handleLayerChange} // This prop might not be used by VoiceNavigator
              />

              {poiCategories.length > 0 && (
                <div className="collapsible-panel expanded poi-categories-panel">
                  <div className="panel-header">
                    <h2>Explore Nearby</h2>
                  </div>
                  <div className="panel-content poi-categories-list">
                    {poiCategories.map((category, index) => (
                      <button
                        key={category.key || `category-${index}`} // Ensure unique key
                        className="poi-category-button"
                        onClick={() => handlePoiCategorySearch(category.key)}
                        title={`Search for ${category.name}`}
                      >
                        <span className="poi-category-icon">
                          {category.icon}
                        </span>
                        <span className="poi-category-name">
                          {category.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="collapsible-panel expanded">
                <div className="panel-header">
                  <h2>Command History</h2>
                  {voiceCommands.length > 0 && (
                    <span className="command-count">
                      {voiceCommands.length}
                    </span>
                  )}
                </div>
                <div className="panel-content">
                  <VoiceCommandLog commands={voiceCommands} />
                </div>
              </div>
            </div>
          </div>

          <div className="right-panel">
            <Routes>
              <Route
                path="/"
                element={
                  <>
                    <MapContainer
                      onMapReady={setMapInstance}
                      onLocationUpdate={(loc) => {
                        setCurrentLocation(loc);
                      }}
                      voiceStatus={voiceStatus}
                      activeLayers={activeLayers}
                      currentLocation={currentLocation}
                      searchResults={searchResults}
                      customMarkers={customMarkers}
                      center={mapCenter}
                      zoom={mapZoom}
                      isLoading={isLoading}
                    />
                    <DebugPanel
                      activeLayers={activeLayers}
                      wmsService={wmsService}
                    />
                  </>
                }
              />
            </Routes>
          </div>
        </main>

        {/* Help Modal */}
        {showHelp && (
          <div
            className="help-modal-overlay"
            onClick={() => setShowHelp(false)}
          >
            <div
              className="help-modal-content"
              onClick={(e) => e.stopPropagation()}
              id="help-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-modal-title"
            >
              <div className="help-modal-header">
                <h2 id="help-modal-title">Voice Commands & Map Features</h2>
                <button
                  className="help-modal-close-button"
                  onClick={() => setShowHelp(false)}
                  aria-label="Close help"
                >
                  &times;
                </button>
              </div>
              <div className="help-modal-body">
                <div className="help-modal-section">
                  <h3>Voice Commands</h3>
                  <p className="help-description">
                    Control the map using your voice with these commands:
                  </p>

                  <div className="help-category">
                    <h4>Search & Navigation</h4>
                    <ul className="command-examples">
                      <li>
                        <strong>Search for locations:</strong> "Find restaurants
                        near me", "Show hospitals in Delhi", "Where is the
                        Eiffel Tower?"
                      </li>
                      <li>
                        <strong>Navigate:</strong> "Take me to Central Park",
                        "Directions to Taj Mahal", "Route to 123 Main Street"
                      </li>
                      <li>
                        <strong>Points of Interest:</strong> "Find parks
                        nearby", "Show me coffee shops", "Where are the nearest
                        ATMs?"
                      </li>
                    </ul>
                  </div>

                  <div className="help-category">
                    <h4>Map Controls</h4>
                    <ul className="command-examples">
                      <li>
                        <strong>Pan the map:</strong> "Pan left", "Pan right",
                        "Pan up", "Pan down"
                      </li>
                      <li>
                        <strong>Zoom control:</strong> "Zoom in", "Zoom out",
                        "Set zoom level to 15"
                      </li>
                      <li>
                        <strong>Reset view:</strong> "Reset map", "Clear view",
                        "Start over"
                      </li>
                      <li>
                        <strong>Current location:</strong> "Where am I?", "Show
                        my current location", "Center on me"
                      </li>
                      <li>
                        <strong>Add markers:</strong> "Add marker", "Drop pin at
                        Eiffel Tower", "Place marker here", "Mark this location"
                      </li>
                    </ul>
                  </div>

                  <div className="help-category">
                    <h4>Map Layers & Data Visualization</h4>
                    <ul className="command-examples">
                      <li>
                        <strong>Base Maps:</strong> "Show standard map", "Show
                        satellite", "Switch to terrain"
                      </li>
                      <li>
                        <strong>Transportation:</strong> "Show traffic layer",
                        "Show transit layer", "Show railway map", "Show cycling
                        routes"
                      </li>
                      <li>
                        <strong>Weather:</strong> "Show precipitation", "Show
                        temperature", "Show clouds", "Show wind"
                      </li>
                      <li>
                        <strong>Terrain:</strong> "Show topographic map", "Show
                        elevation", "Show contour lines"
                      </li>
                      <li>
                        <strong>Other Layers:</strong> "Show humanitarian
                        layer", "Show sea map", "Show hiking trails"
                      </li>
                    </ul>
                    <p>
                      <em>
                        Try toggling layers with "show", "hide" or "toggle"
                        followed by the layer name.
                      </em>
                    </p>
                  </div>
                </div>

                <div className="help-modal-section">
                  <h3>Map Data Sources</h3>
                  <p className="help-description">
                    Aakash Vaani integrates various map data sources for rich
                    geospatial information:
                  </p>

                  <div className="help-sources">
                    <div className="help-source">
                      <h4>Base Maps</h4>
                      <ul>
                        <li>
                          <strong>OpenStreetMap:</strong> Comprehensive
                          worldwide mapping data
                        </li>
                        <li>
                          <strong>ESRI Satellite:</strong> High-resolution
                          satellite imagery
                        </li>
                        <li>
                          <strong>CartoDB:</strong> Beautiful cartographic base
                          layers
                        </li>
                        <li>
                          <strong>Stamen Maps:</strong> Artistic map renderings
                        </li>
                      </ul>
                    </div>

                    <div className="help-source">
                      <h4>Specialized Data</h4>
                      <ul>
                        <li>
                          <strong>OpenWeatherMap:</strong> Real-time weather
                          data visualization
                        </li>
                        <li>
                          <strong>NASA GIBS:</strong> Earth observation
                          satellite imagery
                        </li>
                        <li>
                          <strong>OpenTopoMap:</strong> Detailed topographic
                          information
                        </li>
                        <li>
                          <strong>OpenRailwayMap:</strong> Global railway
                          network data
                        </li>
                        <li>
                          <strong>CyclOSM:</strong> Bicycle route and
                          infrastructure data
                        </li>
                        <li>
                          <strong>Humanitarian OSM:</strong> Maps for
                          humanitarian response
                        </li>
                        <li>
                          <strong>Bhuvan:</strong> Indian Space Research
                          Organisation's geoportal
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="help-modal-section">
                  <h3>Voice Recognition Modes</h3>
                  <div className="recognition-modes">
                    <div className="recognition-mode">
                      <h4>
                        Web Speech API{" "}
                        <span className="mode-default">(Default)</span>
                      </h4>
                      <p>
                        Uses your browser's speech recognition for accurate,
                        comprehensive command processing. Requires internet
                        connection and sends audio to cloud services.
                      </p>
                    </div>

                    <div className="recognition-mode">
                      <h4>
                        TensorFlow.js{" "}
                        <span className="mode-privacy">(Privacy-Focused)</span>
                      </h4>
                      <p>
                        On-device speech recognition using machine learning.
                        Works offline and keeps your voice data on your device.
                        Limited to basic commands but better for privacy.
                      </p>
                    </div>
                  </div>
                  <p className="toggle-tip">
                    Switch between modes using the toggle button below the
                    microphone.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;
