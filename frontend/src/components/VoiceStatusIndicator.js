import React from 'react';

const VoiceStatusIndicator = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'listening':
        return {
          icon: '🎤',
          text: 'Listening...',
          description: 'Speak your command now'
        };
      case 'processing':
        return {
          icon: '⚡',
          text: 'Processing...',
          description: 'Understanding your command'
        };
      case 'success':
        return {
          icon: '✅',
          text: 'Command Executed',
          description: 'Action completed successfully'
        };
      case 'error':
        return {
          icon: '❌',
          text: 'Error',
          description: 'Please try again'
        };
      default:
        return {
          icon: '🔇',
          text: 'Voice Control Ready',
          description: 'Click to start voice commands'
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div className={`voice-status-indicator ${status}`}>
      <span className="status-icon">{statusConfig.icon}</span>
      <div className="status-info">
        <div className="status-text">{statusConfig.text}</div>
        <div className="status-description" style={{ 
          fontSize: '0.75rem', 
          color: '#888', 
          marginTop: '0.2rem' 
        }}>
          {statusConfig.description}
        </div>
      </div>
    </div>
  );
};

export default VoiceStatusIndicator;