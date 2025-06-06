import React, { useState, useEffect, useRef, useCallback } from "react";
import { modelDownloader } from '../utils/modelDownloader';

class VoiceRecognitionEngine {
  constructor(options = {}) {
    const {
      language = "en-US",
      continuous = false,
      interimResults = true,
      onResult = () => {},
      onCommand = () => {},
      onStart = () => {},
      onEnd = () => {},
      onError = () => {},
      // TFJS specific options
      onTfResult = () => {}, // Callback for TFJS raw results
      tfConfidenceThreshold = 0.85, // Confidence for TFJS commands
    } = options;

    // Web Speech API properties
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
    this.SPEECH_END_TIMEOUT = 1500;

    // TFJS Speech Commands properties
    this.tfRecognizer = null;
    this.tfIsListening = false;
    this.tfVocabulary = [];
    this.onTfResult = onTfResult;
    this.tfConfidenceThreshold = tfConfidenceThreshold;

    this.initializeWebSpeech();
  }

  // Web Speech API initialization
  initializeWebSpeech() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      console.error("Speech recognition not supported in this browser");
      this.onError(new Error("Web Speech API not supported"));
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
      console.error("Error initializing Web Speech API:", error);
      this.onError(error);
      return false;
    }
  }

  // Web Speech API Methods
  start() {
    if (!this.recognition) {
      if (!this.initializeWebSpeech()) return false;
    }
    if (this.isListening) return true;
    try {
      this.currentCommandParts = [];
      this.recognition.start();
      return true;
    } catch (error) {
      console.error("Error starting Web Speech recognition:", error);
      if (error.name !== "InvalidStateError") {
        this.onError(error);
      }
      return false;
    }
  }

  stop() {
    if (!this.recognition || !this.isListening) return false;
    try {
      this.recognition.stop();
      return true;
    } catch (error) {
      console.error("Error stopping Web Speech recognition:", error);
      return false;
    }
  }

  // Standard Web Speech API handlers
  handleStart() {
    this.isListening = true;
    this.onStart();
  }

  handleResult(event) {
    let interimTranscript = "";
    let finalTranscriptSegment = "";

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
      const currentFullCommand = this.currentCommandParts.join(" ");
      this.onResult(currentFullCommand, true);

      clearTimeout(this.speechTimeout);
      this.speechTimeout = setTimeout(() => {
        const fullCommandToProcess = this.currentCommandParts.join(" ").trim();
        if (fullCommandToProcess) {
          const commandObject = this.processCommand(fullCommandToProcess);
          this.onCommand(commandObject);
        }
        this.currentCommandParts = [];
        if (!this.continuous && this.isListening) {
          this.stop();
        }
      }, this.SPEECH_END_TIMEOUT);
    }
  }

  handleError(event) {
    this.onError(event);
  }

  handleEnd() {
    this.isListening = false;
    clearTimeout(this.speechTimeout);
    const fullCommand = this.currentCommandParts.join(" ").trim();
    if (fullCommand) {
      const commandObject = this.processCommand(fullCommand);
      this.onCommand(commandObject);
    }
    this.currentCommandParts = [];
    this.onEnd();
  }

  // TensorFlow.js Speech Commands Methods
  async loadTfModel() {
    if (this.tfRecognizer) return true;

    try {
      // Import the speech commands package
      const speechCommands = await import('@tensorflow-models/speech-commands');
      
      // Create the recognizer
      this.tfRecognizer = speechCommands.create(
        'BROWSER_FFT', // Using browser's native FFT
        undefined, // No custom vocabulary
        undefined, // Use default model URL
        undefined // Use default metadata URL
      );
      
      // Load the model
      await this.tfRecognizer.ensureModelLoaded();
      
      // Get vocabulary from the model
      this.tfVocabulary = this.tfRecognizer.wordLabels();
      
      console.log('TensorFlow.js speech model loaded successfully');
      console.log('Available commands:', this.tfVocabulary);
      
      return true;
    } catch (error) {
      console.error('Error loading TensorFlow.js speech model:', error);
      this.onError({
        error: 'tf_model_load_failed',
        message: `Failed to load TensorFlow.js speech model: ${error.message}`
      });
      return false;
    }
  }

  async startTfListening() {
    if (!this.tfRecognizer) {
      const loaded = await this.loadTfModel();
      if (!loaded) return false;
    }
    
    if (this.tfIsListening) return true; // Already listening
    
    try {
      this.tfIsListening = true;
      this.onStart();
      
      const suppressionTimeMs = 1000;
      
      // Start listening with callbacks
      await this.tfRecognizer.listen(
        async (result) => {
          // Get scores and indices, sorted by score
          const scores = Array.from(result.scores);
          const wordIndices = scores
            .map((s, i) => ({ score: s, index: i }))
            .sort((a, b) => b.score - a.score);
          
          // Get the top result above threshold
          const topWordIndex = wordIndices[0];
          if (topWordIndex.score > this.tfConfidenceThreshold) {
            const recognizedWord = this.tfVocabulary[topWordIndex.index];
            
            // Process the recognized word
            this.onTfResult(recognizedWord, topWordIndex.score);
            
            // Convert to a command if possible
            const command = this.processTfCommand(recognizedWord);
            if (command) {
              this.onCommand(command);
            }
          }
        },
        {
          includeSpectrogram: false, // Don't include spectrogram in callback
          probabilityThreshold: 0.75, // Only trigger for high-probability matches
          invokeCallbackOnNoiseAndUnknown: false, // Don't invoke for noise or unknown
          overlapFactor: 0.5, // Overlap between frames
          suppressionTimeMillis: suppressionTimeMs // Minimum time between triggers
        }
      );
      
      console.log('TensorFlow.js speech recognition started');
      return true;
    } catch (error) {
      console.error('Error starting TensorFlow.js speech recognition:', error);
      this.tfIsListening = false;
      this.onError({
        error: 'tf_listen_failed',
        message: `Failed to start TensorFlow.js speech recognition: ${error.message}`
      });
      return false;
    }
  }

  stopTfListening() {
    if (this.tfRecognizer && this.tfIsListening) {
      this.tfRecognizer.stopListening();
      this.tfIsListening = false;
      this.onEnd();
      console.log("TFJS listening stopped.");
      return true;
    }
    return false;
  }

  processCommand(command) {
    const searchPattern = /^(search|find|show me|look for|locate|where is|what is near|nearby)\s+(.+)$/i;
    const navigatePattern = /^(navigate|take me|go|directions|route|how do I get)\s+(?:to|towards|toward)\s+(.+)$/i;
    const layerPattern = /^(show|hide|toggle)\s+(.+?)(?:\s+layer|\s+map)?$/i;
    const zoomPattern = /^(?:zoom\s+(in|out)|set zoom(?:\s+level)?\s+(?:to\s+)?(\d+))$/i;
    const resetPattern = /^(reset|clear)\s+(?:map|view|everything)$/i;
    const helpPattern = /^(help|commands|what can I say|what can I do)$/i;
    const locationPattern = /^(where am i|my location|current location)$/i;
    const panPattern = /^(pan|move|scroll)\s+(left|right|up|down)$/i;
    const addMarkerPattern = /^(add marker|drop pin|place marker)(?:\s+(?:at|near)\s+(.+))?$/i;

    let match;
    if (match = command.match(addMarkerPattern)) {
      return { type: "add_marker", locationQuery: match[2] ? match[2].trim() : null, rawCommand: command };
    } else if (match = command.match(searchPattern)) {
      return { type: "search", query: match[2], rawCommand: command };
    } else if (match = command.match(navigatePattern)) {
      return { type: "navigate", destination: match[2], rawCommand: command };
    } else if (match = command.match(layerPattern)) {
      return {
        type: "layer",
        action: match[1].toLowerCase(),
        layer: match[2].toLowerCase().trim(),
        rawCommand: command,
      };
    } else if (match = command.match(zoomPattern)) {
      return {
        type: "zoom",
        action: match[1] ? match[1].toLowerCase() : null,
        level: match[2] ? parseInt(match[2], 10) : null,
        rawCommand: command,
      };
    } else if (match = command.match(resetPattern)) {
      return { type: "reset", rawCommand: command };
    } else if (match = command.match(helpPattern)) {
      return { type: "help", rawCommand: command };
    } else if (match = command.match(locationPattern)) {
      return { type: "location_query", rawCommand: command };
    } else if (match = command.match(panPattern)) {
      return {
        type: "pan",
        direction: match[2].toLowerCase(),
        rawCommand: command,
      };
    }
    return { type: "unknown", rawCommand: command };
  }

  processTfCommand(word) {
    // Map TensorFlow.js speech command vocabulary to app commands
    const command = word.toLowerCase();
    switch (command) {
      case "up": return { type: "pan", direction: "up", rawCommand: `tf: ${word}` };
      case "down": return { type: "pan", direction: "down", rawCommand: `tf: ${word}` };
      case "left": return { type: "pan", direction: "left", rawCommand: `tf: ${word}` };
      case "right": return { type: "pan", direction: "right", rawCommand: `tf: ${word}` };
      case "go": return { type: "zoom", action: "in", rawCommand: `tf: ${word}` };
      case "stop": return { type: "zoom", action: "out", rawCommand: `tf: ${word}` };
      case "yes": return { type: "add_marker", locationQuery: null, rawCommand: `tf: ${word}` };
      default: return { type: "unknown_tf", rawCommand: `tf: ${word}` };
    }
  }
}

const VoiceNavigator = ({ onVoiceCommand, onStatusChange }) => {
  const [isMicAvailable, setIsMicAvailable] = useState(false);
  const [isListeningState, setIsListeningState] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalizedTranscript, setFinalizedTranscript] = useState("");
  const [tfLastWord, setTfLastWord] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const engineRef = useRef(null);
  const [manualCommand, setManualCommand] = useState("");
  const [useTfRecognizer, setUseTfRecognizer] = useState(false);

  useEffect(() => {
    const checkMicrophonePermission = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsMicAvailable(true);
      } catch (error) {
        console.error("Microphone permission denied:", error);
        setErrorMessage("Microphone access denied. Please enable it in browser settings.");
        setIsMicAvailable(false);
      }
    };
    checkMicrophonePermission();

    engineRef.current = new VoiceRecognitionEngine({
      language: "en-US",
      continuous: false,
      interimResults: true,
      onResult: (transcript, isFinal) => {
        if (isFinal) {
          setFinalizedTranscript(transcript);
          setInterimTranscript("");
        } else {
          setInterimTranscript(transcript);
        }
      },
      onCommand: (commandObj) => {
        if (onStatusChange) onStatusChange("processing");
        if (commandObj) {
          onVoiceCommand(commandObj);
        }
        setFinalizedTranscript("");
        setInterimTranscript("");
        setTfLastWord("");
        if (onStatusChange) setTimeout(() => onStatusChange("idle"), 300);
      },
      onStart: () => {
        setIsListeningState(true);
        setErrorMessage("");
        setInterimTranscript("");
        setFinalizedTranscript("");
        setTfLastWord("");
        if (onStatusChange) onStatusChange("listening");
      },
      onEnd: () => {
        setIsListeningState(false);
        if (onStatusChange) onStatusChange("idle");
      },
      onError: (eventOrError) => {
        setIsListeningState(false);
        if (onStatusChange) onStatusChange("error");
        let msg = eventOrError.message || `Error: ${eventOrError.error || "Unknown error"}`;
        if (eventOrError.error) {
          switch (eventOrError.error) {
            case "no-speech": msg = "No speech detected."; break;
            case "aborted": msg = "Listening aborted."; break;
            case "audio-capture": msg = "Microphone problem."; break;
            case "network": msg = "Network error for Web Speech."; break;
            case "not-allowed": msg = "Microphone permission denied."; break;
            case "service-not-allowed": msg = "Speech recognition service denied."; break;
            default: break;
          }
        }
        if (eventOrError.error !== "aborted" || (engineRef.current && (engineRef.current.isListening || engineRef.current.tfIsListening))) {
          setErrorMessage(msg);
        }
        setTimeout(() => { if (onStatusChange) onStatusChange("idle"); }, 3000);
      },
      // TFJS specific callback
      onTfResult: (word, score) => {
        if (word && word !== '_background_noise_' && word !== '_unknown_') {
          setTfLastWord(`TF: ${word} (${score.toFixed(2)})`);
        } else if (word === '_background_noise_') {
          setTfLastWord("TF: (Background noise)");
        }
      }
    });
    
    // Optionally preload the TFJS model
    if (useTfRecognizer && engineRef.current) {
      engineRef.current.loadTfModel().then(loaded => {
        if(loaded) console.log("TFJS Model preloaded by VoiceNavigator");
      });
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current.stopTfListening();
      }
    };
  }, [onVoiceCommand, onStatusChange, useTfRecognizer]);

  const toggleListening = useCallback(() => {
    if (!isMicAvailable || !engineRef.current) return;

    if (useTfRecognizer) {
      if (engineRef.current.tfIsListening) {
        engineRef.current.stopTfListening();
      } else {
        if(engineRef.current.isListening) engineRef.current.stop();
        engineRef.current.startTfListening();
      }
    } else { // Web Speech API
      if (engineRef.current.isListening) {
        engineRef.current.stop();
      } else {
        if(engineRef.current.tfIsListening) engineRef.current.stopTfListening();
        engineRef.current.start();
      }
    }
  }, [isMicAvailable, useTfRecognizer]);

  // Fix manual command handler in VoiceNavigator component
  const handleManualCommandSubmit = (e) => {
    e.preventDefault();
    if (manualCommand.trim() && engineRef.current && onVoiceCommand) {
      if (onStatusChange) onStatusChange('processing');
      const commandObj = engineRef.current.processCommand(manualCommand.trim());
      // Add timestamp to manually created commands
      commandObj.timestamp = new Date().toISOString();
      onVoiceCommand(commandObj);
      setManualCommand('');
      // Provide visual feedback
      setInterimTranscript('Processing: ' + manualCommand);
      setTimeout(() => {
        setInterimTranscript('');
        if (onStatusChange) onStatusChange('idle');
      }, 1500);
    }
  };

  return (
    <div className="voice-navigator">
      <div className="voice-control-panel">
        <button
          className={`mic-button ${isListeningState ? "active" : ""} ${!isMicAvailable ? "disabled" : ""}`}
          onClick={toggleListening}
          disabled={!isMicAvailable}
          aria-label={isMicAvailable ? (isListeningState ? "Stop listening" : "Start voice control") : "Microphone not available"}
          title={isMicAvailable ? (isListeningState ? "Stop listening" : "Start voice control") : "Microphone not available"}
        >
          <span className="mic-icon">{isListeningState ? "🎤" : "🎙️"}</span>
          <span className="mic-text">
            {isListeningState 
              ? "Listening..." 
              : isMicAvailable 
                ? "Start Voice Control" 
                : "Mic Unavailable"}
          </span>
        </button>
        
        <button 
          onClick={() => setUseTfRecognizer(prev => !prev)} 
          title="Toggle recognizer mode"
          aria-label="Toggle between browser speech recognition and TensorFlow.js on-device recognition"
          className="recognizer-toggle-button"
        >
          {useTfRecognizer ? "Using TFJS (On-device)" : "Using Web Speech API"}
        </button>

        <form
          onSubmit={handleManualCommandSubmit}
          className="manual-command-form"
          aria-label="Manual command input form"
        >
          <input
            type="text"
            value={manualCommand}
            onChange={(e) => setManualCommand(e.target.value)}
            placeholder="Type a command (e.g., 'find restaurants near me')"
            className="manual-command-input"
            aria-label="Type command"
          />
          <button
            type="submit"
            className="manual-command-button"
            title="Send command"
            aria-label="Submit command"
          >
            <span role="img" aria-hidden="true">➤</span>
          </button>
        </form>

        {errorMessage && (
          <div className="voice-error-message" role="alert">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{errorMessage}</span>
          </div>
        )}

        {(interimTranscript || finalizedTranscript || tfLastWord) && (
          <div className="transcript-container" aria-live="polite">
            <div className="interim-transcript">{interimTranscript}</div>
            <div className="final-transcript-display">
              {finalizedTranscript || tfLastWord}
            </div>
          </div>
        )}
        <div className="voice-instructions">
          <p>Say "help" for available commands. {useTfRecognizer ? "(TFJS Active)" : "(WebSpeech Active)"}</p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VoiceNavigator);
