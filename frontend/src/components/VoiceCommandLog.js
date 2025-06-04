import React from 'react';

/**
 * Component to display a list of voice commands and their results
 * @param {Array} commands - List of command objects with type, text, and timestamp
 */
const VoiceCommandLog = ({ commands }) => {
  // Format timestamp into human-readable time
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      console.error('Error formatting timestamp:', e);
      return '';
    }
  };

  // Get appropriate icon for command type
  const getCommandIcon = (command) => {
    switch (command.type) {
      case 'search':
        return '🔍';
      case 'navigate':
        return '🧭';
      case 'layer':
        return '📊';
      case 'zoom':
        return '🔎';
      case 'reset':
        return '🔄';
      case 'help':
        return '❓';
      case 'error':
        return '⚠️';
      default:
        return '💬';
    }
  };
  
  // Generate status text based on command
  const getStatusText = (command) => {
    if (command.error) {
      return <span className="command-status error">Failed</span>;
    }
    
    if (command.processing) {
      return <span className="command-status processing">Processing...</span>;
    }
    
    return <span className="command-status success">Completed</span>;
  };
  
  // If no commands, show empty state
  if (!commands || commands.length === 0) {
    return (
      <div className="voice-command-empty">
        <p>No commands yet. Try saying "Find restaurants near me"</p>
      </div>
    );
  }

  return (
    <div className="voice-command-log">
      <ul className="command-list">
        {commands.map((command, index) => (
          <li key={`${command.timestamp || ''}-${index}`} className="command-item">
            <div className="command-icon">{getCommandIcon(command)}</div>
            
            <div className="command-content">
              <div className="command-text">
                {command.rawCommand || 'Unknown command'}
              </div>
              
              <div className="command-meta">
                <span className="command-type">{command.type || 'unknown'}</span>
                <span className="command-time">{formatTimestamp(command.timestamp)}</span>
              </div>
            </div>
            
            <div className="command-status-container">
              {getStatusText(command)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default React.memo(VoiceCommandLog);