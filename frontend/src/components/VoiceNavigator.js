import React, { useState, useEffect, useRef, useCallback } from 'react';
import { wmsService } from '../services/WMSService';
import { geocodingService } from '../services/GeocodingService';
import { poiService } from '../services/POIService';

// Voice Recognition Engine for advanced voice processing
class VoiceRecognitionEngine {
  constructor(options = {}) {
    const {
      language = 'en-US',
      continuous = true,
      interimResults = true,
      onResult = () => {},
      onStart = () => {},
      onEnd = () => {},
      onError = () => {}
    } = options;

    this.recognition = null;
    this.language = language;
    this.continuous = continuous;
    this.interimResults = interimResults;
    this.onResult = onResult;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onError = onError;
    this.isListening = false;
    this.resultBuffer = [];
    this.commandTimeout = null;
    
    this.initialize();
  }

  initialize() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('Speech recognition not supported in this browser');
      return false;
    }

    try {
      // Use the appropriate speech recognition API
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      // Configure recognition
      this.recognition.lang = this.language;
      this.recognition.continuous = this.continuous;
      this.recognition.interimResults = this.interimResults;
      
      // Set up event listeners
      this.recognition.onstart = this.handleStart.bind(this);
      this.recognition.onresult = this.handleResult.bind(this);
      this.recognition.onerror = this.handleError.bind(this);
      this.recognition.onend = this.handleEnd.bind(this);
      
      return true;
    } catch (error) {
      console.error('Error initializing speech recognition:', error);
      return false;
    }
  }

  start() {
    if (!this.recognition) {
      if (!this.initialize()) {
        this.onError(new Error('Could not initialize speech recognition'));
        return false;
      }
    }

    try {
      this.recognition.start();
      return true;
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.onError(error);
      return false;
    }
  }

  stop() {
    if (!this.recognition) return false;

    try {
      this.recognition.stop();
      return true;
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
      return false;
    }
  }

  handleStart(event) {
    this.isListening = true;
    this.resultBuffer = [];
    this.onStart(event);
  }

  handleResult(event) {
    const results = event.results;
    const currentResult = results[results.length - 1];
    const transcript = currentResult[0].transcript.trim();
    
    // For interim results, just call the callback
    if (!currentResult.isFinal) {
      this.onResult(transcript, false);
      return;
    }

    // For final results, add to buffer and process
    this.resultBuffer.push(transcript);
    this.onResult(transcript, true);

    // Process after a short delay to capture complete sentences
    clearTimeout(this.commandTimeout);
    this.commandTimeout = setTimeout(() => {
      const fullCommand = this.resultBuffer.join(' ').trim();
      if (fullCommand) {
        this.processCommand(fullCommand);
      }
      this.resultBuffer = [];
    }, 1000);
  }

  handleError(event) {
    this.isListening = false;
    this.onError(event);
  }

  handleEnd(event) {
    this.isListening = false;
    this.onEnd(event);
    
    // Auto restart if configured for continuous mode
    if (this.continuous) {
      setTimeout(() => {
        if (this.recognition) {
          try {
            this.recognition.start();
          } catch (error) {
            console.error('Error restarting speech recognition:', error);
          }
        }
      }, 1000);
    }
  }

  processCommand(command) {
    // Match patterns for different command types
    const searchPattern = /^(search|find|show me|look for|locate|where is|what is near|nearby)\s+(.+)$/i;
    const navigatePattern = /^(navigate|take me|go|directions|route|how do I get)\s+(?:to|towards|toward)\s+(.+)$/i;
    const layerPattern = /^(show|hide|toggle)\s+(traffic|satellite|terrain|transit|bike|weather|precipitation|temperature|wind|cloud|roads|buildings|borders)\s+(layer|map)?$/i;
    const zoomPattern = /^(?:zoom\s+(in|out)|set zoom(?:\s+level)?\s+(?:to\s+)?(\d+))$/i;
    const resetPattern = /^(reset|clear)\s+(map|view|everything)$/i;
    const helpPattern = /^(help|commands|what can I say|what can I do)$/i;

    // Check each pattern
    let match;
    if (match = command.match(searchPattern)) {
      return {
        type: 'search',
        query: match[2],
        rawCommand: command
      };
    } else if (match = command.match(navigatePattern)) {
      return {
        type: 'navigate',
        destination: match[2],
        rawCommand: command
      };
    } else if (match = command.match(layerPattern)) {
      return {
        type: 'layer',
        action: match[1].toLowerCase(),
        layer: match[2].toLowerCase(),
        rawCommand: command
      };
    } else if (match = command.match(zoomPattern)) {
      return {
        type: 'zoom',
        action: match[1] ? match[1].toLowerCase() : null,
        level: match[2] ? parseInt(match[2], 10) : null,
        rawCommand: command
      };
    } else if (match = command.match(resetPattern)) {
      return {
        type: 'reset',
        rawCommand: command
      };
    } else if (match = command.match(helpPattern)) {
      return {
        type: 'help',
        rawCommand: command
      };
    }

    // If no pattern matches, try a more general approach
    if (command.includes('search') || command.includes('find')) {
      return {
        type: 'search',
        query: command.replace(/(search|find)\s+/i, ''),
        rawCommand: command
      };
    }

    // Return unknown command type as fallback
    return {
      type: 'unknown',
      rawCommand: command
    };
  }
}

const VoiceNavigator = ({
  onVoiceCommand,
  onStatusChange,
  mapInstance,
  currentLocation,
  activeLayers,
  onLayerChange,
}) => {
  const [isMicAvailable, setIsMicAvailable] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const engineRef = useRef(null);

  // Initialize voice recognition engine
  useEffect(() => {
    // Check for microphone permissions
    const checkMicrophonePermission = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsMicAvailable(true);
      } catch (error) {
        console.error('Microphone permission denied:', error);
        setErrorMessage('Microphone access denied. Please enable microphone access.');
        setIsMicAvailable(false);
      }
    };

    checkMicrophonePermission();

    // Create the engine instance
    engineRef.current = new VoiceRecognitionEngine({
      language: 'en-US',
      continuous: true,
      interimResults: true,
      onResult: handleRecognitionResult,
      onStart: handleRecognitionStart,
      onEnd: handleRecognitionEnd,
      onError: handleRecognitionError
    });

    // Cleanup on component unmount
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, []);

  // Handle recognition result
  const handleRecognitionResult = useCallback((transcript, isFinal) => {
    if (isFinal) {
      setFinalTranscript(transcript);
      setInterimTranscript('');
    } else {
      setInterimTranscript(transcript);
    }
  }, []);

  // Handle recognition start
  const handleRecognitionStart = useCallback(() => {
    setIsListening(true);
    setErrorMessage('');
    if (onStatusChange) {
      onStatusChange('listening');
    }
  }, [onStatusChange]);

  // Handle recognition end
  const handleRecognitionEnd = useCallback(() => {
    setIsListening(false);
    setInterimTranscript('');
    if (onStatusChange) {
      onStatusChange('idle');
    }
  }, [onStatusChange]);

  // Handle recognition error
  const handleRecognitionError = useCallback((event) => {
    setIsListening(false);
    if (onStatusChange) {
      onStatusChange('error');
    }

    // Handle different error types
    switch (event.error) {
      case 'no-speech':
        setErrorMessage('No speech was detected. Please try again.');
        break;
      case 'aborted':
        setErrorMessage('Speech recognition was aborted.');
        break;
      case 'audio-capture':
        setErrorMessage('No microphone was found or microphone is disabled.');
        break;
      case 'network':
        setErrorMessage('Network error occurred. Please check your connection.');
        break;
      case 'not-allowed':
        setErrorMessage('Microphone permission denied. Please enable microphone access.');
        break;
      default:
        setErrorMessage(`Error: ${event.error || 'Unknown error'}`);
    }

    // Reset status after showing error
    setTimeout(() => {
      if (onStatusChange) {
        onStatusChange('idle');
      }
    }, 3000);
  }, [onStatusChange]);

  // Start voice recognition
  const startListening = useCallback(() => {
    if (!isMicAvailable) {
      setErrorMessage('Microphone not available. Please check permissions.');
      return;
    }

    if (engineRef.current) {
      engineRef.current.start();
    }
  }, [isMicAvailable]);

  // Stop voice recognition
  const stopListening = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
  }, []);

  // Toggle listening state
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Process command when final transcript is updated
  useEffect(() => {
    if (finalTranscript && engineRef.current && onVoiceCommand) {
      const commandObj = engineRef.current.processCommand(finalTranscript);
      if (commandObj && commandObj.type !== 'unknown') {
        onVoiceCommand(commandObj);
      }
      setFinalTranscript('');
    }
  }, [finalTranscript, onVoiceCommand]);

  // Automatic restart if recognition stops unexpectedly
  useEffect(() => {
    const restartTimeout = setTimeout(() => {
      // If the engine exists but isn't listening, try to restart
      if (engineRef.current && !isListening && !errorMessage) {
        engineRef.current.start();
      }
    }, 5000);

    return () => clearTimeout(restartTimeout);
  }, [isListening, errorMessage]);

  return (
    <div className="voice-navigator">
      <div className="voice-control-panel">
        <button
          className={`mic-button ${isListening ? 'active' : ''} ${!isMicAvailable ? 'disabled' : ''}`}
          onClick={toggleListening}
          disabled={!isMicAvailable}
        >
          <span className="mic-icon">{isListening ? '🎤' : '🎙️'}</span>
          <span className="mic-text">
            {isListening ? 'Listening...' : 'Start Voice Control'}
          </span>
        </button>

        {errorMessage && (
          <div className="voice-error-message">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{errorMessage}</span>
          </div>
        )}

        {interimTranscript && (
          <div className="transcript-container">
            <div className="interim-transcript">{interimTranscript}</div>
          </div>
        )}

        <div className="voice-instructions">
          <p>Say "help" for available commands</p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VoiceNavigator);
