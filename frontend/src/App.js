import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import VoiceNavigator from './components/VoiceNavigator';
import MapContainer from './components/MapContainer';
import VoiceCommandLog from './components/VoiceCommandLog';
import VoiceStatusIndicator from './components/VoiceStatusIndicator';

function App() {
  const [voiceCommands, setVoiceCommands] = useState([]);
  const [mapInstance, setMapInstance] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState('idle'); // idle, listening, processing, success, error
  const [currentLocation, setCurrentLocation] = useState(null);
  const [activeLayers, setActiveLayers] = useState(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize the application
    const initApp = async () => {
      try {
        // Detect user's preferred language
        const userLang = navigator.language || 'en-US';
        console.log('User language detected:', userLang);

        // Initialize speech synthesis voices
        if ('speechSynthesis' in window) {
          speechSynthesis.getVoices(); // Trigger voice loading
        }

        // Show welcome message
        setTimeout(() => {
          if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance('Welcome to Geo Voice Navigator. Your AI-powered mapping assistant is ready.');
            utterance.rate = 1.0;
            utterance.volume = 0.7;
            speechSynthesis.speak(utterance);
          }
        }, 1000);

        setIsInitialized(true);
      } catch (error) {
        console.error('App initialization error:', error);
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
      status: 'executed',
      confidence: command.confidence || 1.0
    };
    
    setVoiceCommands(prev => [newCommand, ...prev].slice(0, 25)); // Keep last 25 commands
  };

  const handleVoiceStatusChange = (status) => {
    setVoiceStatus(status);
  };

  const handleLocationUpdate = (location) => {
    setCurrentLocation(location);
  };

  const handleWMSLayerChange = (layerId, enabled) => {
    setActiveLayers(prev => {
      const newSet = new Set(prev);
      if (enabled) {
        newSet.add(layerId);
      } else {
        newSet.delete(layerId);
      }
      return newSet;
    });
  };

  const toggleHelpOverlay = () => {
    setShowHelp(!showHelp);
  };

  const clearAllCommands = () => {
    setVoiceCommands([]);
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('Command history cleared');
      utterance.volume = 0.6;
      speechSynthesis.speak(utterance);
    }
  };

  const exportCommandHistory = () => {
    const data = {
      exportDate: new Date().toISOString(),
      totalCommands: voiceCommands.length,
      commands: voiceCommands
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice-commands-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isInitialized) {
    return (
      <div className="app-loading">
        <div className="loading-content">
          <div className="loading-icon">🗺️</div>
          <div className="loading-text">Initializing Geo Voice Navigator</div>
          <div className="loading-subtext">Loading AI models and geospatial services...</div>
          <div className="loading-progress">
            <div className="progress-bar"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header with Voice Status */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="title-icon">🗺️</span>
            Geo Voice Navigator
            <span className="title-subtitle">Professional AI-Powered Voice Mapping</span>
          </h1>
          <div className="header-controls">
            <VoiceStatusIndicator status={voiceStatus} />
            <button 
              className="help-button"
              onClick={toggleHelpOverlay}
              title="Show voice commands help"
            >
              ❓
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Left Panel - Voice Commands & Controls */}
        <div className="left-panel">
          <VoiceNavigator 
            onVoiceCommand={handleVoiceCommand}
            onStatusChange={handleVoiceStatusChange}
            mapInstance={mapInstance}
            currentLocation={currentLocation}
            activeLayers={activeLayers}
            onLayerChange={handleWMSLayerChange}
          />
          
          <div className="command-log-container">
            <div className="command-log-header">
              <h3 className="command-log-title">
                📝 Command History ({voiceCommands.length})
              </h3>
              <div className="command-log-actions">
                <button 
                  className="log-action-button"
                  onClick={clearAllCommands}
                  title="Clear command history"
                >
                  🗑️
                </button>
                <button 
                  className="log-action-button"
                  onClick={exportCommandHistory}
                  title="Export command history"
                >
                  💾
                </button>
              </div>
            </div>
            <VoiceCommandLog commands={voiceCommands} />
          </div>
        </div>

        {/* Right Panel - Map */}
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

      {/* Enhanced Help Overlay */}
      {showHelp && (
        <div className="help-overlay">
          <div className="help-content">
            <div className="help-header">
              <h2>🎤 Voice Commands Guide</h2>
              <button className="help-close" onClick={toggleHelpOverlay}>✕</button>
            </div>
            
            <div className="help-sections">
              <div className="help-section">
                <h3>🧭 Navigation Commands</h3>
                <ul>
                  <li>"Go to Tokyo, Japan"</li>
                  <li>"Navigate to Times Square"</li>
                  <li>"Show me Paris"</li>
                  <li>"Take me to Eiffel Tower"</li>
                </ul>
              </div>

              <div className="help-section">
                <h3>🔍 Zoom & View Controls</h3>
                <ul>
                  <li>"Zoom in" / "Zoom out"</li>
                  <li>"Set zoom to level 15"</li>
                  <li>"Show satellite view"</li>
                  <li>"Switch to terrain"</li>
                  <li>"Change to dark mode"</li>
                </ul>
              </div>

              <div className="help-section">
                <h3>📍 Location Services</h3>
                <ul>
                  <li>"Show my location"</li>
                  <li>"Where am I?"</li>
                  <li>"Add marker here"</li>
                  <li>"Find restaurants near me"</li>
                  <li>"Locate hospitals nearby"</li>
                </ul>
              </div>

              <div className="help-section">
                <h3>🛰️ Data Layers</h3>
                <ul>
                  <li>"Enable weather layer"</li>
                  <li>"Show NASA satellite imagery"</li>
                  <li>"Turn on precipitation data"</li>
                  <li>"Display terrain elevation"</li>
                </ul>
              </div>

              <div className="help-section">
                <h3>🤖 AI Assistant</h3>
                <ul>
                  <li>"What is this location?"</li>
                  <li>"Describe this area"</li>
                  <li>"Help" / "Show commands"</li>
                  <li>"Clear all markers"</li>
                  <li>"Stop listening"</li>
                </ul>
              </div>
            </div>

            <div className="help-tips">
              <h3>💡 Pro Tips</h3>
              <ul>
                <li>Speak clearly and at normal pace</li>
                <li>Use natural language - the AI understands context</li>
                <li>Try different phrasings if a command doesn't work</li>
                <li>Enable TensorFlow.js mode for offline processing</li>
                <li>Commands work in multiple languages</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Footer with Enhanced Instructions */}
      <footer className="app-footer">
        <div className="instructions">
          <h3>🎤 Voice-Powered Professional GIS</h3>
          <div className="feature-highlights">
            <div className="feature-item">
              <span className="feature-icon">🧠</span>
              <span>AI-Powered Voice Recognition</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🛰️</span>
              <span>Professional WMS Layers</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🌍</span>
              <span>Global Geocoding & POI Search</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span>GPU-Accelerated Processing</span>
            </div>
          </div>
          
          <div className="command-grid">
            <span>"Navigate to Sydney Opera House"</span>
            <span>"Find coffee shops within 1 kilometer"</span>
            <span>"Enable NASA satellite imagery"</span>
            <span>"Show weather precipitation overlay"</span>
            <span>"What's the elevation at this location?"</span>
            <span>"Switch to hybrid satellite view"</span>
          </div>
        </div>
      </footer>

      {/* Performance Metrics (Development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-panel">
          <div className="debug-metric">
            <span>Commands: {voiceCommands.length}</span>
          </div>
          <div className="debug-metric">
            <span>Active Layers: {activeLayers.size}</span>
          </div>
          <div className="debug-metric">
            <span>Status: {voiceStatus}</span>
          </div>
          {currentLocation && (
            <div className="debug-metric">
              <span>Location: {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;