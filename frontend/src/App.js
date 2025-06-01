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

  const handleVoiceCommand = (command, transcript) => {
    const timestamp = new Date().toISOString();
    const newCommand = {
      id: Date.now(),
      command,
      transcript,
      timestamp,
      status: 'executed'
    };
    
    setVoiceCommands(prev => [newCommand, ...prev].slice(0, 20)); // Keep last 20 commands
  };

  const handleVoiceStatusChange = (status) => {
    setVoiceStatus(status);
  };

  const handleLocationUpdate = (location) => {
    setCurrentLocation(location);
  };

  return (
    <div className="app-container">
      {/* Header with Voice Status */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="title-icon">🗺️</span>
            Geo Voice Navigator
            <span className="title-subtitle">AI-Powered Voice Mapping</span>
          </h1>
          <VoiceStatusIndicator status={voiceStatus} />
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
          />
          <VoiceCommandLog commands={voiceCommands} />
        </div>

        {/* Right Panel - Map */}
        <div className="right-panel">
          <MapContainer 
            onMapReady={setMapInstance}
            onLocationUpdate={handleLocationUpdate}
            voiceStatus={voiceStatus}
          />
        </div>
      </div>

      {/* Footer with Instructions */}
      <footer className="app-footer">
        <div className="instructions">
          <h3>🎤 Voice Commands</h3>
          <div className="command-grid">
            <span>"Go to New York"</span>
            <span>"Zoom in"</span>
            <span>"Show satellite view"</span>
            <span>"Find hospitals near me"</span>
            <span>"Add marker here"</span>
            <span>"Show my location"</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;