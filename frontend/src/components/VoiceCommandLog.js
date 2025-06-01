import React from 'react';

const VoiceCommandLog = ({ commands }) => {
  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getCommandIcon = (command) => {
    if (!command || !command.action) return '🗣️';
    
    switch (command.action) {
      case 'navigate': return '🧭';
      case 'zoomIn': return '🔍';
      case 'zoomOut': return '🔎';
      case 'changeLayer': return '🗺️';
      case 'showCurrentLocation': return '📍';
      case 'findNearby': return '📍';
      case 'addMarker': return '📌';
      case 'help': return '❓';
      case 'clear': return '🗑️';
      default: return '🗣️';
    }
  };

  const getActionDescription = (command) => {
    if (!command || !command.action) return 'Voice command processed';
    
    switch (command.action) {
      case 'navigate':
        return `Navigate to ${command.parameter || 'location'}`;
      case 'zoomIn':
        return 'Zoom in on map';
      case 'zoomOut':
        return 'Zoom out on map';
      case 'zoomToLevel':
        return `Zoom to level ${command.parameter}`;
      case 'changeLayer':
        return `Switch to ${command.parameter} view`;
      case 'showCurrentLocation':
        return 'Show current location';
      case 'findNearby':
        return `Find ${command.parameter} nearby`;
      case 'addMarker':
        return 'Add marker at current location';
      case 'help':
        return 'Show voice commands help';
      case 'clear':
        return 'Clear map';
      case 'stopListening':
        return 'Stop voice recognition';
      default:
        return `Execute ${command.action}`;
    }
  };

  return (
    <div className="command-log">
      <h3 className="command-log-title">
        📝 Command History
      </h3>
      
      {commands.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          color: '#666', 
          padding: '2rem',
          fontStyle: 'italic' 
        }}>
          No voice commands yet. Start speaking to see your command history here.
        </div>
      ) : (
        <div className="command-list">
          {commands.map((command) => (
            <div key={command.id} className="command-item">
              <div className="command-header" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                marginBottom: '0.5rem' 
              }}>
                <span style={{ fontSize: '1.2rem' }}>
                  {getCommandIcon(command.command)}
                </span>
                <span className="command-transcript">
                  "{command.transcript}"
                </span>
              </div>
              
              <div className="command-action">
                {getActionDescription(command.command)}
              </div>
              
              <div className="command-timestamp">
                {formatTimestamp(command.timestamp)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VoiceCommandLog;