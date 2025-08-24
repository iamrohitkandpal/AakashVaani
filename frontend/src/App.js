import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import MapContainer from "./components/MapContainer.js";
import VoiceNavigator from "./components/VoiceNavigator.js";
import VoiceCommandLog from "./components/VoiceCommandLog.js";
import VoiceStatusIndicator from "./components/VoiceStatusIndicator.js";
import DebugPanel from "./components/DebugPanel.js";
import { wmsService } from "./services/WMSService.js";
import { poiService } from "./services/POIService.js";
import { geocodingService } from "./services/GeocodingService.js";
import ErrorBoundary from './components/ErrorBoundary';

// Helper: wrapper for fetch + JSON + error handling
const fetchJson = async (url, options = {}) => {
  try {
    const resp = await fetch(url, options);
    if (!resp.ok) {
      throw new Error(`Request failed: ${resp.status} ${resp.statusText}`);
    }
    return await resp.json();
  } catch (err) {
    console.error("Fetch error:", err);
    throw err;
  }
};

function App() {
  const [voiceCommands, setVoiceCommands] = useState([]);
  const [mapInstance, setMapInstance] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [activeLayers, setActiveLayers] = useState(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [mapCenter, setMapCenter] = useState({ lat: 28.6139, lng: 77.209 });
  const [mapZoom, setMapZoom] = useState(13);
  const [isLoading, setIsLoading] = useState(false);
  const [poiCategories, setPoiCategories] = useState([]);
  const [customMarkers, setCustomMarkers] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineNotification, setShowOfflineNotification] = useState(false);

  // Validate backend URL via env var
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  useEffect(() => {
    if (!BACKEND_URL) {
      console.warn(
        "REACT_APP_BACKEND_URL is not defined. Some features may not work."
      );
    }
  }, [BACKEND_URL]);

  // Handle online/offline status changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineNotification(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineNotification(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []); 

  // Utility: show a brief feedback element for voice commands
  const showCommandFeedback = (message, status = "info") => {
    const feedbackEl = document.createElement("div");
    feedbackEl.className = `command-feedback ${status}`;
    feedbackEl.innerHTML = `<span class="feedback-icon">${
      status === "error" ? "⚠️" : status === "processing" ? "⏳" : "✓"
    }</span><span>${message}</span>`;
    document.body.appendChild(feedbackEl);
    // Trigger CSS transition
    setTimeout(() => feedbackEl.classList.add("visible"), 10);
    setTimeout(() => {
      feedbackEl.classList.remove("visible");
      setTimeout(() => feedbackEl.remove(), 500);
    }, 3000);
  };

  // Notify in voiceCommands log (keep latest 3)
  const pushVoiceCommandNotification = (obj) => {
    setVoiceCommands((prev) => [obj, ...prev.slice(0, 2)]);
  };

  // On mount: get user location once
  useEffect(() => {
    if (isInitialized) return;
    const getPositionPromise = () =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject({
            message: "Geolocation not supported. Using default location.",
            code: "NOSUPPORT",
          });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          resolve,
          (error) => {
            let msg;
            switch (error.code) {
              case error.PERMISSION_DENIED:
                msg = "Location access denied. Using default location.";
                break;
              case error.POSITION_UNAVAILABLE:
                msg = "Location unavailable. Using default location.";
                break;
              case error.TIMEOUT:
                msg = "Location request timed out. Using default location.";
                break;
              default:
                msg = "Unknown location error. Using default location.";
            }
            reject({ message: msg, originalError: error });
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });

    const setDefaultLocation = () => {
      const defaultLoc = { lat: 28.6139, lng: 77.209 };
      setCurrentLocation(defaultLoc);
      setMapCenter(defaultLoc);
    };

    const fetchLocation = async () => {
      setIsLoading(true);
      try {
        const position = await getPositionPromise();
        const { latitude, longitude } = position.coords;
        const loc = { lat: latitude, lng: longitude };
        setCurrentLocation(loc);
        setMapCenter(loc);
        pushVoiceCommandNotification({
          type: "info",
          rawCommand: "Location detected successfully.",
          timestamp: new Date().toISOString(),
          status: "completed",
        });
      } catch (geoErr) {
        console.error("Geolocation error:", geoErr);
        setDefaultLocation();
        pushVoiceCommandNotification({
          type: geoErr.code === "NOSUPPORT" ? "info" : "error",
          rawCommand: geoErr.message,
          timestamp: new Date().toISOString(),
          status: "completed",
        });
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };
    fetchLocation();
  }, [isInitialized]);

  // Fetch POI categories from backend or fallback service
  useEffect(() => {
    const fetchCategories = async () => {
      if (!BACKEND_URL) {
        setPoiCategories(poiService.getCategories());
        return;
      }
      try {
        const categories = await fetchJson(`${BACKEND_URL}/categories`);
        setPoiCategories(categories);
      } catch (err) {
        console.error("Error fetching POI categories:", err);
        setPoiCategories(poiService.getCategories());
      }
    };
    fetchCategories();
  }, [BACKEND_URL]);

  // Background sync registration (service worker)
  useEffect(() => {
    const registerBackgroundSync = async () => {
      if (
        "serviceWorker" in navigator &&
        "SyncManager" in window &&
        navigator.onLine
      ) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.sync.register("sync-saved-searches");
          await registration.sync.register("sync-offline-markers");
          await registration.sync.register("refresh-offline-data");
          console.log("Background sync registered successfully");
        } catch (err) {
          console.error("Background sync registration failed:", err);
          // Fallback manual refresh
          if (navigator.onLine) {
            refreshOfflineDataManually();
          }
        }
      } else {
        console.log(
          "Background sync not supported or offline; using manual refresh"
        );
        if (navigator.onLine) {
          refreshOfflineDataManually();
        }
      }
    };
    registerBackgroundSync();
  }, [refreshOfflineDataManually, BACKEND_URL]); // Add to dependency array

  // Manual offline data refresh
  const refreshOfflineDataManually = useCallback(async () => {
    if (!BACKEND_URL) return;
    setIsLoading(true);
    try {
      const lastStr = localStorage.getItem("last-cache-update");
      const last = lastStr ? parseInt(lastStr, 10) : 0;
      const now = Date.now();
      if (now - last >= 24 * 60 * 60 * 1000 || last === 0) {
        console.log("Refreshing offline data manually");
        const data = await fetchJson(`${BACKEND_URL}/offline/data`);
        localStorage.setItem("offline-data", JSON.stringify(data));
        localStorage.setItem("last-cache-update", now.toString());
        console.log("Offline data refreshed successfully");
      } else {
        console.log("Offline data still fresh; no refresh needed");
      }
    } catch (err) {
      console.error("Error refreshing offline data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [BACKEND_URL]);

  // Update a command’s status in the log
  const updateCommandStatus = (timestamp, status, errorMessage = null) => {
    setVoiceCommands((prev) =>
      prev.map((cmd) =>
        cmd.timestamp === timestamp
          ? { ...cmd, status, error: errorMessage }
          : cmd
      )
    );
  };

  // Handle incoming voice commands
  const handleVoiceCommand = useCallback(
    (commandObj) => {
      const cmdWithTs = {
        ...commandObj,
        timestamp: commandObj.timestamp || new Date().toISOString(),
        status: "processing",
      };
      
      // Add to commands list for display
      pushVoiceCommandNotification(cmdWithTs);
      
      showCommandFeedback(`Processing: ${cmdWithTs.rawCommand}`, "processing");
      
      // Process command by type
      switch (cmdWithTs.type) {
        case "search":
          handleSearchCommand(cmdWithTs);
          break;
        case "navigate":
          handleNavigationCommand(cmdWithTs);
          break;
        case "pan":
          // Implementation...
          break;
        case "layer":
          handleLayerCommand(cmdWithTs);
          break;
        case "zoom":
          handleZoomCommand(cmdWithTs);
          break;
        case "reset":
          handleResetCommand(cmdWithTs);
          break;
        case "help":
          setShowHelp(true);
          updateCommandStatus(cmdWithTs.timestamp, "completed");
          break;
        case "where":
          // Implementation...
          break;
        case "add_marker":
          handleAddMarkerCommand(cmdWithTs);
          break;
        default:
          console.warn("Unknown command type:", cmdWithTs.type);
          updateCommandStatus(
            cmdWithTs.timestamp,
            "error",
            "Unknown command type"
          );
          showCommandFeedback(
            `Sorry, I didn't understand "${cmdWithTs.rawCommand}"`,
            "error"
          );
      }
    },
    [
      mapInstance, 
      currentLocation, 
      handleAddMarkerCommand, 
      handleLayerCommand, 
      handleNavigationCommand, 
      handleResetCommand, 
      handleSearchCommand, 
      handleZoomCommand,
      pushVoiceCommandNotification,
      showCommandFeedback,
      updateCommandStatus
    ] // Add all dependencies
  );

  // Add marker command handler
  const handleAddMarkerCommand = async (commandObj) => {
    let lat, lng, name;
    name = `Marker @ ${new Date().toLocaleTimeString()}`;
    setIsLoading(true);
    try {
      if (commandObj.locationQuery) {
        // Geocode query
        const results = await geocodingService.search(commandObj.locationQuery);
        if (results && results.length > 0) {
          const r = results[0];
          lat = r.lat;
          lng = r.lng;
          name = r.name || commandObj.locationQuery;
        } else {
          throw new Error(
            `Could not find location: ${commandObj.locationQuery}`
          );
        }
      } else if (mapInstance) {
        const centerPt = mapInstance.getCenter();
        lat = centerPt.lat;
        lng = centerPt.lng;
      } else if (currentLocation) {
        lat = currentLocation.lat;
        lng = currentLocation.lng;
        name = "My Location";
      } else {
        throw new Error("Map or location not available to add marker.");
      }
      if (
        typeof lat === "number" &&
        typeof lng === "number" &&
        !isNaN(lat) &&
        !isNaN(lng)
      ) {
        const newMarker = { lat, lng, name, id: `custom-${Date.now()}` };
        setCustomMarkers((prev) => [...prev, newMarker]);
        setMapCenter({ lat, lng });
        setMapZoom((z) => Math.max(z, 15));
        updateCommandStatus(commandObj.timestamp, "completed");
      } else {
        throw new Error("Invalid coordinates for marker.");
      }
    } catch (err) {
      console.error("Error in add_marker command:", err);
      updateCommandStatus(commandObj.timestamp, "error", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Search command handler
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
        const first = results[0];
        if (typeof first.lat === "number" && typeof first.lng === "number") {
          setMapCenter({ lat: first.lat, lng: first.lng });
          setMapZoom(15);
          updateCommandStatus(commandObj.timestamp, "completed");
        } else {
          throw new Error(
            "Search successful, but top result lacks valid coordinates."
          );
        }
      } else {
        throw new Error("No results found for your search.");
      }
    } catch (err) {
      console.error("Search error:", err);
      updateCommandStatus(commandObj.timestamp, "error", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Navigation command handler
  const handleNavigationCommand = async (commandObj) => {
    if (!commandObj.destination) {
      updateCommandStatus(
        commandObj.timestamp,
        "error",
        "No destination provided"
      );
      return;
    }
    setIsLoading(true);
    try {
      const results = await geocodingService.search(commandObj.destination);
      if (results && results.length > 0) {
        const dest = results[0];
        setMapCenter({ lat: dest.lat, lng: dest.lng });
        setMapZoom(16);
        setSearchResults([dest]);
        updateCommandStatus(commandObj.timestamp, "completed");
      } else {
        throw new Error(`No location found for ${commandObj.destination}`);
      }
    } catch (err) {
      console.error("Navigation error:", err);
      updateCommandStatus(commandObj.timestamp, "error", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Layer command handler
  const handleLayerCommand = (commandObj) => {
    if (!commandObj.layer) {
      updateCommandStatus(commandObj.timestamp, "error", "No layer specified");
      return;
    }
    const layerId = wmsService.detectLayerFromCommand(commandObj.layer);
    if (!layerId) {
      const available = wmsService.getAllLayers().map((l) => l.name);
      updateCommandStatus(
        commandObj.timestamp,
        "error",
        `Layer "${commandObj.layer}" not found. Try one of: ${available
          .slice(0, 5)
          .join(", ")}...`
      );
      return;
    }
    if (commandObj.action === "show") {
      setActiveLayers((prev) => new Set([...prev, layerId]));
      updateCommandStatus(commandObj.timestamp, "completed");
    } else if (commandObj.action === "hide") {
      setActiveLayers((prev) => {
        const s = new Set(prev);
        s.delete(layerId);
        return s;
      });
      updateCommandStatus(commandObj.timestamp, "completed");
    } else if (commandObj.action === "toggle") {
      setActiveLayers((prev) => {
        const s = new Set(prev);
        if (s.has(layerId)) s.delete(layerId);
        else s.add(layerId);
        return s;
      });
      updateCommandStatus(commandObj.timestamp, "completed");
    } else {
      updateCommandStatus(
        commandObj.timestamp,
        "error",
        `Unknown action "${commandObj.action}". Use show/hide/toggle.`
      );
    }
  };

  // Zoom command handler
  const handleZoomCommand = (commandObj) => {
    if (!mapInstance) {
      updateCommandStatus(commandObj.timestamp, "error", "Map not ready");
      return;
    }
    if (commandObj.action === "in") {
      setMapZoom((z) => Math.min(z + 1, 18));
      updateCommandStatus(commandObj.timestamp, "completed");
    } else if (commandObj.action === "out") {
      setMapZoom((z) => Math.max(z - 1, 3));
      updateCommandStatus(commandObj.timestamp, "completed");
    } else if (commandObj.level) {
      const lvl = parseInt(commandObj.level, 10);
      if (!isNaN(lvl) && lvl >= 3 && lvl <= 18) {
        setMapZoom(lvl);
        updateCommandStatus(commandObj.timestamp, "completed");
      } else {
        updateCommandStatus(
          commandObj.timestamp,
          "error",
          "Invalid zoom level"
        );
      }
    } else {
      updateCommandStatus(commandObj.timestamp, "error", "Unknown zoom action");
    }
  };

  // Reset command handler
  const handleResetCommand = () => {
    if (currentLocation) {
      setMapCenter(currentLocation);
    }
    setMapZoom(13);
    setActiveLayers(new Set());
    setSearchResults([]);
    updateCommandStatus(new Date().toISOString(), "completed");
  };

  // Handle POI category click
  const handlePoiCategorySearch = (categoryKey) => {
    const category = poiCategories.find((c) => c.key === categoryKey);
    if (!category) {
      console.error(`Category not found: ${categoryKey}`);
      return;
    }
    console.log("Searching for POI category:", category);
    const timestamp = new Date().toISOString();
    const cmd = {
      type: "search",
      query: `${category.name} near me`,
      timestamp,
    };
    setVoiceCommands((prev) => [
      { ...cmd, status: "processing" },
      ...prev.slice(0, 2),
    ]);
    handleSearchCommand(cmd);
  };

  return (
    <Router>
      <ErrorBoundary>
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
                  onClick={() => setShowHelp((prev) => !prev)}
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
                  showCommandFeedback={showCommandFeedback}
                />
                {poiCategories.length > 0 && (
                  <div className="collapsible-panel expanded poi-categories-panel">
                    <div className="panel-header">
                      <h2>Explore Nearby</h2>
                    </div>
                    <div className="panel-content poi-categories-list">
                      {poiCategories.map((category, idx) => (
                        <button
                          key={category.key || `category-${idx}`}
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
                        onLocationUpdate={(loc) => setCurrentLocation(loc)}
                        voiceStatus={voiceStatus}
                        activeLayers={activeLayers}
                        currentLocation={currentLocation}
                        searchResults={searchResults}
                        customMarkers={customMarkers}
                        center={mapCenter}
                        zoom={mapZoom}
                        isLoading={isLoading}
                        isOnline={isOnline}
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
      </ErrorBoundary>
    </Router>
  );
}

export default App;
