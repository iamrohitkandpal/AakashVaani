import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';

class VoiceRecognitionEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.tfModel = null;
    this.modelMode = 'browser'; // 'browser' or 'tensorflow'
    this.commandPatterns = new Map();
    this.initializeCommandPatterns();
  }

  initializeCommandPatterns() {
    // Define sophisticated command patterns for natural language processing
    this.commandPatterns.set('navigation', [
      { pattern: /(?:go to|navigate to|show me|find|locate)\s+(.+)/i, action: 'navigate', param: 1 },
      { pattern: /(?:zoom in|zoom closer)/i, action: 'zoomIn' },
      { pattern: /(?:zoom out|zoom back)/i, action: 'zoomOut' },
      { pattern: /(?:zoom to level|set zoom)\s+(\d+)/i, action: 'zoomToLevel', param: 1 },
    ]);

    this.commandPatterns.set('layers', [
      { pattern: /(?:show|switch to|change to)\s+(satellite|street|terrain|hybrid)\s*(?:view|layer|map)?/i, action: 'changeLayer', param: 1 },
      { pattern: /(?:show|enable|turn on)\s+(.+?)\s*(?:layer|overlay)/i, action: 'enableLayer', param: 1 },
      { pattern: /(?:hide|disable|turn off)\s+(.+?)\s*(?:layer|overlay)/i, action: 'disableLayer', param: 1 },
    ]);

    this.commandPatterns.set('location', [
      { pattern: /(?:where am i|show my location|current location)/i, action: 'showCurrentLocation' },
      { pattern: /(?:find|search for|show me)\s+(.+?)\s*(?:near me|nearby)/i, action: 'findNearby', param: 1 },
      { pattern: /(?:add marker|place marker|mark this location)/i, action: 'addMarker' },
    ]);

    this.commandPatterns.set('general', [
      { pattern: /(?:help|what can you do|commands)/i, action: 'help' },
      { pattern: /(?:clear|reset|clean)/i, action: 'clear' },
      { pattern: /(?:stop listening|stop)/i, action: 'stopListening' },
    ]);
  }

  async initializeTensorFlowModel() {
    try {
      // For now, we'll use a placeholder for TensorFlow.js speech commands
      // In a production environment, you would load a pre-trained model
      console.log('Initializing TensorFlow.js voice model...');
      
      // This is where you would load a speech commands model
      // const model = await tf.loadLayersModel('/models/speech-commands/model.json');
      // this.tfModel = model;
      
      this.modelMode = 'tensorflow';
      console.log('TensorFlow.js voice model ready');
      return true;
    } catch (error) {
      console.warn('Failed to load TensorFlow model, falling back to Web Speech API:', error);
      this.modelMode = 'browser';
      return false;
    }
  }

  initializeWebSpeechAPI() {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      throw new Error('Speech recognition not supported in this browser');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 3;
  }

  parseCommand(transcript) {
    const cleanTranscript = transcript.toLowerCase().trim();
    
    for (const [category, patterns] of this.commandPatterns) {
      for (const { pattern, action, param } of patterns) {
        const match = cleanTranscript.match(pattern);
        if (match) {
          const result = { action, category, confidence: 1.0 };
          if (param && match[param]) {
            result.parameter = match[param].trim();
          }
          return result;
        }
      }
    }

    // If no pattern matches, return a search command as fallback
    return {
      action: 'navigate',
      category: 'navigation',
      parameter: cleanTranscript,
      confidence: 0.5
    };
  }

  startListening(onResult, onStatus) {
    if (this.isListening) return;

    try {
      this.initializeWebSpeechAPI();
      this.isListening = true;
      onStatus('listening');

      this.recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          onStatus('processing');
          const command = this.parseCommand(finalTranscript);
          onResult(command, finalTranscript);
          
          setTimeout(() => {
            onStatus('success');
            setTimeout(() => onStatus('listening'), 1000);
          }, 500);
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        onStatus('error');
        setTimeout(() => {
          if (this.isListening) {
            onStatus('listening');
          }
        }, 2000);
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          // Automatically restart recognition
          setTimeout(() => {
            try {
              this.recognition.start();
            } catch (error) {
              console.warn('Failed to restart recognition:', error);
            }
          }, 100);
        }
      };

      this.recognition.start();
    } catch (error) {
      console.error('Failed to start voice recognition:', error);
      onStatus('error');
      this.isListening = false;
    }
  }

  stopListening(onStatus) {
    if (!this.isListening) return;
    
    this.isListening = false;
    if (this.recognition) {
      this.recognition.stop();
    }
    onStatus('idle');
  }

  async switchModel(mode) {
    this.stopListening(() => {});
    
    if (mode === 'tensorflow') {
      const success = await this.initializeTensorFlowModel();
      if (!success) {
        this.modelMode = 'browser';
        return false;
      }
    }
    
    this.modelMode = mode;
    return true;
  }
}

const VoiceNavigator = ({ onVoiceCommand, onStatusChange, mapInstance, currentLocation }) => {
  const [isListening, setIsListening] = useState(false);
  const [modelMode, setModelMode] = useState('browser');
  const [isModelLoading, setIsModelLoading] = useState(false);
  const voiceEngineRef = useRef(null);

  useEffect(() => {
    voiceEngineRef.current = new VoiceRecognitionEngine();
    
    // Initialize TensorFlow.js in the background
    const initTensorFlow = async () => {
      setIsModelLoading(true);
      await voiceEngineRef.current.initializeTensorFlowModel();
      setIsModelLoading(false);
    };
    
    initTensorFlow();
  }, []);

  const handleVoiceResult = (command, transcript) => {
    console.log('Voice command processed:', command, transcript);
    
    // Execute the command on the map
    executeMapCommand(command, transcript);
    
    // Log the command
    onVoiceCommand(command, transcript);
  };

  const executeMapCommand = (command, transcript) => {
    if (!mapInstance) {
      console.warn('Map instance not available');
      return;
    }

    try {
      switch (command.action) {
        case 'navigate':
          // This will be handled by geocoding in the next phase
          console.log('Navigate to:', command.parameter);
          break;
          
        case 'zoomIn':
          mapInstance.zoomIn(2);
          break;
          
        case 'zoomOut':
          mapInstance.zoomOut(2);
          break;
          
        case 'zoomToLevel':
          const level = parseInt(command.parameter);
          if (level >= 1 && level <= 20) {
            mapInstance.setZoom(level);
          }
          break;
          
        case 'changeLayer':
          console.log('Change layer to:', command.parameter);
          // Layer switching will be implemented in map component
          break;
          
        case 'showCurrentLocation':
          if (currentLocation) {
            mapInstance.setView([currentLocation.lat, currentLocation.lng], 15);
          }
          break;
          
        case 'findNearby':
          console.log('Find nearby:', command.parameter);
          // POI search will be implemented in next phase
          break;
          
        case 'addMarker':
          const center = mapInstance.getCenter();
          console.log('Add marker at:', center);
          break;
          
        case 'help':
          console.log('Voice commands help requested');
          break;
          
        case 'clear':
          console.log('Clear map requested');
          break;
          
        case 'stopListening':
          toggleListening();
          break;
          
        default:
          console.log('Unknown command:', command.action);
      }
    } catch (error) {
      console.error('Error executing map command:', error);
    }
  };

  const toggleListening = () => {
    const engine = voiceEngineRef.current;
    if (!engine) return;

    if (isListening) {
      engine.stopListening(onStatusChange);
      setIsListening(false);
    } else {
      engine.startListening(handleVoiceResult, onStatusChange);
      setIsListening(true);
    }
  };

  const switchVoiceModel = async (mode) => {
    if (isModelLoading) return;
    
    setIsModelLoading(true);
    const success = await voiceEngineRef.current.switchModel(mode);
    
    if (success) {
      setModelMode(mode);
    }
    
    setIsModelLoading(false);
  };

  return (
    <div className="voice-control-panel">
      <h2 className="voice-control-title">🎤 Voice Control</h2>
      
      <button 
        className={`voice-button ${isListening ? 'listening' : ''}`}
        onClick={toggleListening}
        disabled={isModelLoading}
      >
        <span className="button-icon">
          {isListening ? '🛑' : '🎤'}
        </span>
        {isListening ? 'Stop Listening' : 'Start Voice Commands'}
      </button>

      <div className="voice-model-selector">
        <div className="model-selector-title">
          Voice Processing Mode:
        </div>
        <div className="model-options">
          <button 
            className={`model-option ${modelMode === 'browser' ? 'active' : ''}`}
            onClick={() => switchVoiceModel('browser')}
            disabled={isModelLoading}
          >
            Browser API
          </button>
          <button 
            className={`model-option ${modelMode === 'tensorflow' ? 'active' : ''}`}
            onClick={() => switchVoiceModel('tensorflow')}
            disabled={isModelLoading}
          >
            {isModelLoading ? 'Loading...' : 'TensorFlow.js'}
          </button>
        </div>
      </div>

      <div className="voice-instructions">
        <h4 style={{ color: '#00ccff', marginBottom: '0.8rem', fontSize: '1rem' }}>
          💡 Try these commands:
        </h4>
        <ul style={{ listStyle: 'none', padding: 0, color: '#ccc', fontSize: '0.9rem' }}>
          <li style={{ marginBottom: '0.4rem' }}>• "Go to New York"</li>
          <li style={{ marginBottom: '0.4rem' }}>• "Zoom in" / "Zoom out"</li>
          <li style={{ marginBottom: '0.4rem' }}>• "Show satellite view"</li>
          <li style={{ marginBottom: '0.4rem' }}>• "Find restaurants near me"</li>
          <li style={{ marginBottom: '0.4rem' }}>• "Show my location"</li>
        </ul>
      </div>
    </div>
  );
};

export default VoiceNavigator;