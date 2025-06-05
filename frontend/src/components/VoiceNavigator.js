import React, { useState, useEffect, useRef, useCallback } from 'react';
// ... other imports (wmsService, geocodingService, poiService) ...

class VoiceRecognitionEngine {
  constructor(options = {}) {
    const {
      language = 'en-US',
      continuous = false, // Set to false for command-by-command, true for ongoing dictation
      interimResults = true,
      onResult = () => {},
      onCommand = () => {}, // Callback for a fully formed command
      onStart = () => {},
      onEnd = () => {},
      onError = () => {}
    } = options;

    this.recognition = null;
    this.language = language;
    this.continuous = continuous;
    this.interimResults = interimResults;
    this.onResult = onResult;
    this.onCommand = onCommand;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onError = onError;
    this.isListening = false;
    
    this.currentCommandParts = [];
    this.speechTimeout = null;
    this.SPEECH_END_TIMEOUT = 1500; // ms of silence before considering command complete

    this.initialize();
  }

  initialize() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('Speech recognition not supported in this browser');
      this.onError(new Error('Speech recognition not supported'));
      return false;
    }
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.lang = this.language;
      this.recognition.continuous = this.continuous;
      this.recognition.interimResults = this.interimResults;
      this.recognition.onstart = this.handleStart.bind(this);
      this.recognition.onresult = this.handleResult.bind(this);
      this.recognition.onerror = this.handleError.bind(this);
      this.recognition.onend = this.handleEnd.bind(this);
      return true;
    } catch (error) {
      console.error('Error initializing speech recognition:', error);
      this.onError(error);
      return false;
    }
  }

  start() {
    if (!this.recognition) {
      if (!this.initialize()) return false;
    }
    if (this.isListening) return true; // Already listening
    try {
      this.currentCommandParts = []; // Reset parts for new listening session
      this.recognition.start();
      // isListening will be set true by onstart
      return true;
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      // Avoid calling this.onError if it's an "already started" error
      if (error.name !== 'InvalidStateError') {
        this.onError(error);
      }
      return false;
    }
  }

  stop() {
    if (!this.recognition || !this.isListening) return false;
    try {
      this.recognition.stop();
      // isListening will be set false by onend
      return true;
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
      return false;
    }
  }

  handleStart() {
    this.isListening = true;
    this.onStart();
  }

  handleResult(event) {
    let interimTranscript = '';
    let finalTranscriptSegment = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscriptSegment += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (interimTranscript) {
        this.onResult(interimTranscript, false);
    }

    if (finalTranscriptSegment) {
      this.currentCommandParts.push(finalTranscriptSegment.trim());
      const currentFullCommand = this.currentCommandParts.join(' ');
      this.onResult(currentFullCommand, true); // Show accumulating final transcript

      clearTimeout(this.speechTimeout);
      this.speechTimeout = setTimeout(() => {
        const fullCommandToProcess = this.currentCommandParts.join(' ').trim();
        if (fullCommandToProcess) {
          const commandObject = this.processCommand(fullCommandToProcess);
          this.onCommand(commandObject);
        }
        this.currentCommandParts = []; // Reset for next potential command in continuous mode
                                     // Or if not continuous, this prepares for next start()
        if (!this.continuous && this.isListening) { // If not continuous, stop after one command.
            this.stop();
        }
      }, this.SPEECH_END_TIMEOUT);
    }
  }
  
  handleError(event) {
    // this.isListening = false; // onEnd will handle this
    this.onError(event);
  }

  handleEnd() {
    this.isListening = false;
    clearTimeout(this.speechTimeout); // Clear any pending command processing
    // If there are unprocessed parts when recognition ends abruptly, process them.
    const fullCommand = this.currentCommandParts.join(' ').trim();
    if (fullCommand) {
        const commandObject = this.processCommand(fullCommand);
        this.onCommand(commandObject);
    }
    this.currentCommandParts = [];
    this.onEnd();

    // Auto-restart logic for continuous mode if desired, or manage start/stop via UI
    if (this.continuous && this.recognition) {
        // Be cautious with auto-restarting to avoid loops on errors.
        // This might be better handled by the component based on user action.
    }
  }

  processCommand(command) {
    const searchPattern = /^(search|find|show me|look for|locate|where is|what is near|nearby)\s+(.+)$/i;
    const navigatePattern = /^(navigate|take me|go|directions|route|how do I get)\s+(?:to|towards|toward)\s+(.+)$/i;
    // More specific layer pattern:
    const layerPattern = /^(show|hide|toggle)\s+(.+?)(?:\s+layer|\s+map)?$/i;
    const zoomPattern = /^(?:zoom\s+(in|out)|set zoom(?:\s+level)?\s+(?:to\s+)?(\d+))$/i;
    const resetPattern = /^(reset|clear)\s+(?:map|view|everything)$/i;
    const helpPattern = /^(help|commands|what can I say|what can I do)$/i;
    const locationPattern = /^(where am i|my location|current location)$/i;
    const panPattern = /^(pan|move|scroll)\s+(left|right|up|down)$/i;


    let match;
    if (match = command.match(searchPattern)) {
      return { type: 'search', query: match[2], rawCommand: command };
    } else if (match = command.match(navigatePattern)) {
      return { type: 'navigate', destination: match[2], rawCommand: command };
    } else if (match = command.match(layerPattern)) {
      return { type: 'layer', action: match[1].toLowerCase(), layer: match[2].toLowerCase().trim(), rawCommand: command };
    } else if (match = command.match(zoomPattern)) {
      return { type: 'zoom', action: match[1] ? match[1].toLowerCase() : null, level: match[2] ? parseInt(match[2], 10) : null, rawCommand: command };
    } else if (match = command.match(resetPattern)) {
      return { type: 'reset', rawCommand: command };
    } else if (match = command.match(helpPattern)) {
      return { type: 'help', rawCommand: command };
    } else if (match = command.match(locationPattern)) {
      return { type: 'location_query', rawCommand: command };
    } else if (match = command.match(panPattern)) {
        return { type: 'pan', direction: match[2].toLowerCase(), rawCommand: command };
    }
    return { type: 'unknown', rawCommand: command };
  }
}

const VoiceNavigator = ({
  onVoiceCommand,
  onStatusChange,
  // mapInstance, // mapInstance might not be needed directly here
  // currentLocation, // currentLocation might not be needed directly here
  // activeLayers, // activeLayers might not be needed directly here
  // onLayerChange, // onLayerChange might not be needed directly here
}) => {
  const [isMicAvailable, setIsMicAvailable] = useState(false);
  const [isListeningState, setIsListeningState] = useState(false); // UI listening state
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalizedTranscript, setFinalizedTranscript] = useState(''); // For displaying accumulating final parts
  const [errorMessage, setErrorMessage] = useState('');
  const engineRef = useRef(null);
  const [manualCommand, setManualCommand] = useState('');

  useEffect(() => {
    const checkMicrophonePermission = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsMicAvailable(true);
      } catch (error) {
        console.error('Microphone permission denied:', error);
        setErrorMessage('Microphone access denied. Please enable it in browser settings.');
        setIsMicAvailable(false);
      }
    };
    checkMicrophonePermission();

    engineRef.current = new VoiceRecognitionEngine({
      language: 'en-US', // Or make this configurable
      continuous: false, // Let's try command-by-command first for clarity
      interimResults: true,
      onResult: (transcript, isFinal) => {
        if (isFinal) {
          setFinalizedTranscript(transcript); // Display accumulating final transcript
          setInterimTranscript('');
        } else {
          setInterimTranscript(transcript);
        }
      },
      onCommand: (commandObj) => {
        if (onStatusChange) onStatusChange('processing');
        if (commandObj) {
          onVoiceCommand(commandObj);
        }
        setFinalizedTranscript(''); // Clear display after command is processed
        setInterimTranscript('');
        if (onStatusChange) setTimeout(() => onStatusChange('idle'), 300);
      },
      onStart: () => {
        setIsListeningState(true);
        setErrorMessage('');
        setInterimTranscript('');
        setFinalizedTranscript('');
        if (onStatusChange) onStatusChange('listening');
      },
      onEnd: () => {
        setIsListeningState(false);
        // Interim transcript might linger, clear it
        // setInterimTranscript(''); // Cleared by onCommand or onStart of new session
        if (onStatusChange) onStatusChange('idle');
      },
      onError: (event) => {
        setIsListeningState(false);
        if (onStatusChange) onStatusChange('error');
        let msg = `Error: ${event.error || 'Unknown error'}`;
        switch (event.error) {
          case 'no-speech': msg = 'No speech detected. Please try again.'; break;
          case 'aborted': msg = 'Listening aborted.'; break; // Often due to stop()
          case 'audio-capture': msg = 'Microphone problem. Please check your microphone.'; break;
          case 'network': msg = 'Network error. Please check connection.'; break;
          case 'not-allowed': msg = 'Microphone permission denied.'; break;
          case 'service-not-allowed': msg = 'Speech recognition service denied.'; break;
          default: break;
        }
        // Don't show error for manual aborts if possible to distinguish
        if (event.error !== 'aborted' || (engineRef.current && engineRef.current.isListening)) {
             setErrorMessage(msg);
        }
        setTimeout(() => { if (onStatusChange) onStatusChange('idle'); }, 3000);
      }
    });

    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, [onVoiceCommand, onStatusChange]);


  const toggleListening = useCallback(() => {
    if (!isMicAvailable || !engineRef.current) return;
    if (engineRef.current.isListening) {
      engineRef.current.stop();
    } else {
      engineRef.current.start();
    }
  }, [isMicAvailable]);

  const handleManualCommandSubmit = (e) => {
    e.preventDefault();
    if (manualCommand.trim() && engineRef.current && onVoiceCommand) {
      if (onStatusChange) onStatusChange('processing');
      const commandObj = engineRef.current.processCommand(manualCommand.trim());
      onVoiceCommand(commandObj); // Pass to App.js, even if unknown
      setManualCommand('');
      if (onStatusChange) setTimeout(() => onStatusChange('idle'), 500);
    }
  };

  return (
    <div className="voice-navigator">
      <div className="voice-control-panel">
        <button
          className={`mic-button ${isListeningState ? 'active' : ''} ${!isMicAvailable ? 'disabled' : ''}`}
          onClick={toggleListening}
          disabled={!isMicAvailable}
          title={isMicAvailable ? (isListeningState ? "Stop listening" : "Start voice control") : "Microphone not available"}
        >
          <span className="mic-icon">{isListeningState ? '🎤' : '🎙️'}</span>
          <span className="mic-text">
            {isListeningState ? 'Listening...' : (isMicAvailable ? 'Start Voice Control' : 'Mic Unavailable')}
          </span>
        </button>

        <form onSubmit={handleManualCommandSubmit} className="manual-command-form">
          <input
            type="text"
            value={manualCommand}
            onChange={(e) => setManualCommand(e.target.value)}
            placeholder="Or type your command..."
            className="manual-command-input"
            aria-label="Type command"
          />
          <button type="submit" className="manual-command-button" title="Send command">➔</button>
        </form>

        {errorMessage && (
          <div className="voice-error-message">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{errorMessage}</span>
          </div>
        )}

        {(interimTranscript || finalizedTranscript) && (
          <div className="transcript-container">
            <div className="interim-transcript">{interimTranscript}</div>
            <div className="final-transcript-display">{finalizedTranscript}</div>
          </div>
        )}
        <div className="voice-instructions">
          <p>Say "help" for available commands.</p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VoiceNavigator);
