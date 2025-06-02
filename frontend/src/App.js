import React, { useState, useEffect } from "react";
import "./App.css";
import VoiceNavigator from "./components/VoiceNavigator";
import MapContainer from "./components/MapContainer";
import VoiceCommandLog from "./components/VoiceCommandLog";
import VoiceStatusIndicator from "./components/VoiceStatusIndicator";

function App() {
  const [voiceCommands, setVoiceCommands] = useState([]);
  const [mapInstance, setMapInstance] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("idle"); // idle, listening, processing, success, error
  const [currentLocation, setCurrentLocation] = useState(null);
  const [activeLayers, setActiveLayers] = useState(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState("voice"); // voice, history, or null

  useEffect(() => {
    // Initialize the application
    const initApp = async () => {
      try {
        // Detect user's preferred language
        const userLang = navigator.language || "en-US";
        console.log("User language detected:", userLang);

        // Initialize speech synthesis voices
        if ("speechSynthesis" in window) {
          speechSynthesis.getVoices(); // Trigger voice loading
        }

        // Show welcome message
        setTimeout(() => {
          if ("speechSynthesis" in window) {
            const utterance = new SpeechSynthesisUtterance(
              "Welcome to Aakash Vaani. Your voice-powered mapping assistant is ready."
            );
            utterance.rate = 1.0;
            utterance.volume = 0.7;
            speechSynthesis.speak(utterance);
          }
        }, 1000);

        setIsInitialized(true);
      } catch (error) {
        console.error("App initialization error:", error);
        setIsInitialized(true);
      }
    };

    initApp();
  }, []);

  const handleVoiceCommand = (command, transcript) => {
    const timestamp = new Date().toISOString();
    const newCommand = {
      id: Date.now(),
      command,
      transcript,
      timestamp,
      status: "executed",
      confidence: command.confidence || 1.0,
    };

    setVoiceCommands((prev) => [newCommand, ...prev].slice(0, 25)); // Keep last 25 commands
  };

  const handleVoiceStatusChange = (status) => {
    setVoiceStatus(status);
  };

  const handleLocationUpdate = (location) => {
    setCurrentLocation(location);
  };

  const handleWMSLayerChange = (layerId, enabled) => {
    setActiveLayers((prev) => {
      const newSet = new Set(prev);
      if (enabled) {
        newSet.add(layerId);
      } else {
        newSet.delete(layerId);
      }
      return newSet;
    });
  };

  const toggleHelp = () => {
    setShowHelp(!showHelp);
  };

  const clearAllCommands = () => {
    setVoiceCommands([]);
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance("Command history cleared");
      utterance.rate = 1.1;
      utterance.volume = 0.6;
      speechSynthesis.speak(utterance);
    }
  };

  const exportCommandHistory = () => {
    try {
      const dataStr = JSON.stringify(voiceCommands, null, 2);
      const dataUri =
        "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
      const exportFileDefaultName = `voice_commands_${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      const linkElement = document.createElement("a");
      linkElement.setAttribute("href", dataUri);
      linkElement.setAttribute("download", exportFileDefaultName);
      linkElement.click();
    } catch (error) {
      console.error("Error exporting command history:", error);
    }
  };

  const togglePanel = (panel) => {
    setExpandedPanel(expandedPanel === panel ? null : panel);
  };

  // Loading screen while app initializes
  if (!isInitialized) {
    return (
      <div className="app-loading">
        <div className="loading-content">
          <div className="loading-icon">🛰️</div>
          <div className="loading-text">Initializing Aakash Vaani</div>
          <div className="loading-progress">
            <div className="progress-bar"></div>
          </div>
          <div className="loading-subtext">
            Loading voice recognition and mapping services...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="title-icon">🛰️</span>
            Aakash Vaani
            <span className="title-subtitle">Voice-Powered Mapping</span>
          </h1>
          <div className="header-controls">
            <VoiceStatusIndicator status={voiceStatus} />
            <button
              className="help-button"
              onClick={toggleHelp}
              aria-label="Show help"
            >
              <span>❓</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Left Side - Controls */}
        <div className="left-panel">
          <div className="panel-container">
            {/* Voice Control Panel */}
            <div
              className={`collapsible-panel ${
                expandedPanel === "voice" ? "expanded" : ""
              }`}
            >
              <div
                className="panel-header"
                onClick={() => togglePanel("voice")}
              >
                <h2>
                  <span className="panel-icon">🎤</span> Voice Control
                </h2>
                <span className="panel-toggle">
                  {expandedPanel === "voice" ? "−" : "+"}
                </span>
              </div>
              <div className="panel-content">
                <VoiceNavigator
                  onVoiceCommand={handleVoiceCommand}
                  onStatusChange={handleVoiceStatusChange}
                  mapInstance={mapInstance}
                  currentLocation={currentLocation}
                  activeLayers={activeLayers}
                  onLayerChange={handleWMSLayerChange}
                />
              </div>
            </div>

            {/* Command History Panel */}
            <div
              className={`collapsible-panel ${
                expandedPanel === "history" ? "expanded" : ""
              }`}
            >
              <div
                className="panel-header"
                onClick={() => togglePanel("history")}
              >
                <h2>
                  <span className="panel-icon">📝</span> Command History
                  <span className="command-count">{voiceCommands.length}</span>
                </h2>
                <div className="panel-actions">
                  {expandedPanel === "history" && (
                    <>
                      <button
                        className="action-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearAllCommands();
                        }}
                        title="Clear history"
                      >
                        🗑️
                      </button>
                      <button
                        className="action-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportCommandHistory();
                        }}
                        title="Export history"
                      >
                        💾
                      </button>
                    </>
                  )}
                  <span className="panel-toggle">
                    {expandedPanel === "history" ? "−" : "+"}
                  </span>
                </div>
              </div>
              <div className="panel-content">
                <VoiceCommandLog commands={voiceCommands} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Map */}
        <div className="right-panel">
          <MapContainer
            onMapReady={setMapInstance}
            onLocationUpdate={handleLocationUpdate}
            voiceStatus={voiceStatus}
            activeLayers={activeLayers}
            currentLocation={currentLocation}
          />
        </div>
      </div>

      {/* Help Overlay */}
      {showHelp && (
        <div className="modal-overlay" onClick={toggleHelp}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <span>🎤</span> Voice Command Guide
              </h2>
              <button className="close-button" onClick={toggleHelp}>
                ×
              </button>
            </div>

            <div className="modal-content">
              <div className="command-categories">
                <div className="command-category">
                  <h3>
                    <span className="category-icon">🧭</span> Navigation
                  </h3>
                  <ul>
                    <li>"Navigate to Times Square"</li>
                    <li>"Show me Paris"</li>
                    <li>"Zoom in" / "Zoom out"</li>
                    <li>"Set zoom to level 15"</li>
                  </ul>
                </div>

                <div className="command-category">
                  <h3>
                    <span className="category-icon">🗺️</span> Map Views
                  </h3>
                  <ul>
                    <li>"Switch to satellite view"</li>
                    <li>"Show terrain map"</li>
                    <li>"Change to dark mode"</li>
                    <li>"Show weather layer"</li>
                  </ul>
                </div>

                <div className="command-category">
                  <h3>
                    <span className="category-icon">📍</span> Location
                  </h3>
                  <ul>
                    <li>"Show my location"</li>
                    <li>"Where am I?"</li>
                    <li>"Add marker here"</li>
                    <li>"Find restaurants near me"</li>
                  </ul>
                </div>

                <div className="command-category">
                  <h3>
                    <span className="category-icon">⚙️</span> System
                  </h3>
                  <ul>
                    <li>"Help" - Show this guide</li>
                    <li>"Clear all markers"</li>
                    <li>"Stop listening"</li>
                  </ul>
                </div>
              </div>

              <div className="command-tips">
                <h3>
                  <span>💡</span> Tips
                </h3>
                <p>
                  Speak clearly and naturally. Use your normal speaking voice and
                  pace.
                </p>
                <p>
                  If a command isn't recognized, try rephrasing or using simpler
                  terms.
                </p>
                <p>
                  For better accuracy, minimize background noise when giving
                  commands.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Development Console */}
      {process.env.NODE_ENV === "development" && (
        <div className="dev-console">
          <div className="dev-metric">
            <span>Commands: {voiceCommands.length}</span>
          </div>
          <div className="dev-metric">
            <span>Layers: {activeLayers.size}</span>
          </div>
          <div className="dev-metric">
            <span>Status: {voiceStatus}</span>
          </div>
          {currentLocation && (
            <div className="dev-metric">
              <span>
                Loc: {currentLocation.lat.toFixed(4)},{" "}
                {currentLocation.lng.toFixed(4)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
