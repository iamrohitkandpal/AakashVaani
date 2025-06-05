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

function App() {
  const [voiceCommands, setVoiceCommands] = useState([]);
  const [mapInstance, setMapInstance] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [activeLayers, setActiveLayers] = useState(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [mapCenter, setMapCenter] = useState(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [isLoading, setIsLoading] = useState(false);
  const [poiCategories, setPoiCategories] = useState([]);

  // On mount, try to get user location
  useEffect(() => {
    if (isInitialized) return;

    const getUserLocation = async () => {
      try {
        setIsLoading(true);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setCurrentLocation({ lat: latitude, lng: longitude });
            setMapCenter({ lat: latitude, lng: longitude });
            setIsLoading(false);
          },
          (error) => {
            console.error("Error getting location:", error);
            // Default to New Delhi if location access is denied
            setCurrentLocation({ lat: 28.6139, lng: 77.209 });
            setMapCenter({ lat: 28.6139, lng: 77.209 });
            setIsLoading(false);
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      } catch (error) {
        console.error("Location error:", error);
        setCurrentLocation({ lat: 28.6139, lng: 77.209 });
        setMapCenter({ lat: 28.6139, lng: 77.209 });
        setIsLoading(false);
      }
    };

    getUserLocation();
    setIsInitialized(true);
  }, [isInitialized]);

  // Fetch POI categories on mount
  useEffect(() => {
    const categories = poiService.getCategories(); // Assuming this returns { key, name, icon }
    setPoiCategories(categories);
  }, []);

  // Handle voice command
  const handleVoiceCommand = useCallback((commandObj) => {
    const commandWithTimestamp = {
      ...commandObj,
      timestamp: commandObj.timestamp || new Date().toISOString(),
      status: 'processing', // Add initial status
    };
    setVoiceCommands((prevCommands) => [commandWithTimestamp, ...prevCommands.slice(0, 49)]); // Keep last 50

    // Simulate processing delay for UI feedback if needed
    setTimeout(() => {
      setVoiceCommands(prev => prev.map(cmd => cmd.timestamp === commandWithTimestamp.timestamp ? {...cmd, status: 'completed'} : cmd));
    }, 1000);

    switch (commandObj.type) {
      case "search": handleSearchCommand(commandObj); break;
      case "navigate": handleNavigationCommand(commandObj); break;
      case "layer": handleLayerCommand(commandObj); break;
      case "zoom": handleZoomCommand(commandObj); break;
      case "reset": handleResetCommand(); break;
      case "help": setShowHelp(true); break;
      case "location_query":
        if (currentLocation) {
          setMapCenter({ lat: currentLocation.lat, lng: currentLocation.lng });
          setMapZoom(16);
          // Optionally, add a marker or popup saying "This is your current location"
        } else {
          // Handle case where current location is not yet available
           handleVoiceCommand({ ...commandObj, type: 'error', error: 'Current location not available yet.'});
        }
        break;
      case "pan":
        if (mapInstance) {
            const offset = mapInstance.getSize().y / 4; // Pan by 1/4 of map height/width
            let panBy;
            switch(commandObj.direction) {
                case 'left': panBy = [-offset, 0]; break;
                case 'right': panBy = [offset, 0]; break;
                case 'up': panBy = [0, -offset]; break;
                case 'down': panBy = [0, offset]; break;
                default: break;
            }
            if (panBy) mapInstance.panBy(panBy);
        }
        break;
      default:
        console.log("Unknown command type:", commandObj.type, commandObj);
        // Update command in log to show it was unknown/failed
        setVoiceCommands(prev => prev.map(cmd => cmd.timestamp === commandWithTimestamp.timestamp ? {...cmd, status: 'error', error: 'Unknown command'} : cmd));
    }
  }, [mapInstance, currentLocation /* other handlers */]); // Add dependencies

  // Handle search command
  const handleSearchCommand = async (commandObj) => {
    if (!commandObj.query) {
      updateCommandStatus(commandObj.timestamp, 'error', 'No query provided');
      return;
    }
    setIsLoading(true);
    try {
      const results = await geocodingService.smartSearch(commandObj.query, currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : {});
      setSearchResults(results);
      if (results && results.length > 0) {
        const firstResult = results[0];
        // Ensure lat and lng are valid numbers before setting map center
        if (firstResult && typeof firstResult.lat === 'number' && typeof firstResult.lng === 'number' && !isNaN(firstResult.lat) && !isNaN(firstResult.lng)) {
          setMapCenter({ lat: firstResult.lat, lng: firstResult.lng });
          setMapZoom(15);
          updateCommandStatus(commandObj.timestamp, 'completed');
        } else {
          console.warn("First search result lacks valid coordinates:", firstResult);
          updateCommandStatus(commandObj.timestamp, 'error', 'Search successful, but no map location found for the top result.');
          // Do not attempt to setMapCenter if coordinates are invalid
        }
      } else {
        updateCommandStatus(commandObj.timestamp, 'error', 'No results found for your search.');
      }
    } catch (error) {
      console.error("Search error:", error);
      updateCommandStatus(commandObj.timestamp, 'error', error.message);
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
    if (commandObj.action === "show" && commandObj.layer) {
      const layerId = wmsService.detectLayerFromCommand(commandObj.layer);
      if (layerId) {
        setActiveLayers((prev) => new Set([...prev, layerId]));
      }
    } else if (commandObj.action === "hide" && commandObj.layer) {
      const layerId = wmsService.detectLayerFromCommand(commandObj.layer);
      if (layerId) {
        setActiveLayers((prev) => {
          const newLayers = new Set(prev);
          newLayers.delete(layerId);
          return newLayers;
        });
      }
    } else if (commandObj.action === "toggle" && commandObj.layer) {
      const layerId = wmsService.detectLayerFromCommand(commandObj.layer);
      if (layerId) {
        setActiveLayers((prev) => {
          const newLayers = new Set(prev);
          if (newLayers.has(layerId)) {
            newLayers.delete(layerId);
          } else {
            newLayers.add(layerId);
          }
          return newLayers;
        });
      }
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
    setVoiceCommands(prev => prev.map(cmd =>
      cmd.timestamp === timestamp
        ? { ...cmd, status: status, error: errorMessage }
        : cmd
    ));
  };

  const handlePoiCategorySearch = (categoryKey) => {
    const category = poiCategories.find(c => c.key === categoryKey);
    if (category) {
      // Trigger a search command
      handleVoiceCommand({ type: 'search', query: category.name, timestamp: new Date().toISOString() });
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
              >
                {showHelp ? "Close Help" : "Help"}
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
                onLayerChange={handleLayerChange}
              />

              {/* POI Categories */}
              {poiCategories.length > 0 && (
                <div className="collapsible-panel expanded poi-categories-panel">
                  <div className="panel-header">
                    <h2>Explore Nearby</h2>
                  </div>
                  <div className="panel-content poi-categories-list">
                    {poiCategories.map(category => (
                      <button
                        key={category.key}
                        className="poi-category-button"
                        onClick={() => handlePoiCategorySearch(category.key)}
                        title={`Search for ${category.name}`}
                      >
                        <span className="poi-category-icon">{category.icon}</span>
                        <span className="poi-category-name">{category.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Command History */}
              <div className="collapsible-panel expanded">
                <div className="panel-header">
                  <h2>Command History</h2>
                  {voiceCommands.length > 0 && (
                    <span className="command-count">{voiceCommands.length}</span>
                  )}
                </div>
                <div className="panel-content">
                  <VoiceCommandLog commands={voiceCommands} />
                </div>
              </div>

              {/* Help Panel */}
              {showHelp && (
                <div className="collapsible-panel expanded">
                  <div className="panel-header">
                    <h2>Voice Commands Help</h2>
                    <button
                      className="panel-toggle"
                      onClick={() => setShowHelp(false)}
                    >
                      Close
                    </button>
                  </div>
                  <div className="panel-content">
                    <h3>Available Commands:</h3>
                    <ul style={{ listStyleType: "'🎙️ '" , paddingLeft: '20px'}}>
                      <li>
                        <strong>Search:</strong> "Find restaurants near me", "Where is the Eiffel Tower?"
                      </li>
                      <li>
                        <strong>Navigate:</strong> "Take me to Central Park", "Directions to 123 Main St"
                      </li>
                      <li>
                        <strong>Layers:</strong> "Show traffic layer", "Hide satellite map", "Toggle weather"
                        <br /><em>Try: traffic, satellite, terrain, transit, bike, cycle, railway, sea, hiking, outdoors, topo, precipitation, temperature, wind, clouds, roads, buildings, borders.</em>
                      </li>
                      <li>
                        <strong>Zoom:</strong> "Zoom in", "Zoom out", "Set zoom level to 15"
                      </li>
                      <li>
                        <strong>Reset:</strong> "Reset map", "Clear view"
                      </li>
                       <li>
                        <strong>Location:</strong> "Where am I?", "Show my current location"
                      </li>
                       <li>
                        <strong>Map Interaction (Experimental):</strong> "Pan left", "Pan right", "Pan up", "Pan down"
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="right-panel">
            <Routes>
              <Route
                path="/"
                element={
                  <MapContainer
                    onMapReady={setMapInstance}
                    onLocationUpdate={(loc) => {
                        // This callback might be from map.locate()
                        setCurrentLocation(loc);
                        // Optionally center map on this type of update too
                        // setMapCenter({ lat: loc.lat, lng: loc.lng });
                    }}
                    voiceStatus={voiceStatus}
                    activeLayers={activeLayers}
                    currentLocation={currentLocation}
                    searchResults={searchResults}
                    center={mapCenter}
                    zoom={mapZoom}
                    isLoading={isLoading}
                  />
                }
              />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
