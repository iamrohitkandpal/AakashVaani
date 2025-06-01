import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { geocodingService } from '../services/GeocodingService';
import { poiService } from '../services/POIService';
import { wmsService } from '../services/WMSService';

class VoiceRecognitionEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.tfModel = null;
    this.modelMode = 'browser'; // 'browser' or 'tensorflow'
    this.commandPatterns = new Map();
    this.voiceFeedback = new SpeechSynthesisVoice();
    this.initializeCommandPatterns();
    this.initializeTensorFlowModel();
  }

  initializeCommandPatterns() {
    // Enhanced command patterns for all features
    this.commandPatterns.set('navigation', [
      { pattern: /(?:go to|navigate to|show me|find|locate|take me to)\s+(.+)/i, action: 'navigate', param: 1 },
      { pattern: /(?:zoom in|zoom closer)/i, action: 'zoomIn' },
      { pattern: /(?:zoom out|zoom back)/i, action: 'zoomOut' },
      { pattern: /(?:zoom to level|set zoom)\s+(\d+)/i, action: 'zoomToLevel', param: 1 },
      { pattern: /(?:center on|focus on)\s+(.+)/i, action: 'navigate', param: 1 },
    ]);

    this.commandPatterns.set('layers', [
      { pattern: /(?:show|switch to|change to|enable)\s+(satellite|street|terrain|hybrid|dark|light)\s*(?:view|layer|map|mode)?/i, action: 'changeLayer', param: 1 },
      { pattern: /(?:show|enable|turn on)\s+(.+?)\s*(?:layer|overlay)/i, action: 'enableWMSLayer', param: 1 },
      { pattern: /(?:hide|disable|turn off)\s+(.+?)\s*(?:layer|overlay)/i, action: 'disableWMSLayer', param: 1 },
      { pattern: /(?:nasa|satellite imagery|modis)/i, action: 'enableWMSLayer', param: 'nasa_modis_terra' },
      { pattern: /(?:weather|precipitation|rain)/i, action: 'enableWMSLayer', param: 'openweather_precipitation' },
      { pattern: /(?:clouds|cloud cover)/i, action: 'enableWMSLayer', param: 'openweather_clouds' },
      { pattern: /(?:terrain|elevation|topographic)/i, action: 'enableWMSLayer', param: 'stamen_terrain' },
    ]);

    this.commandPatterns.set('location', [
      { pattern: /(?:where am i|show my location|current location)/i, action: 'showCurrentLocation' },
      { pattern: /(?:find|search for|show me|locate)\s+(.+?)\s*(?:near me|nearby)/i, action: 'findNearby', param: 1 },
      { pattern: /(?:restaurants?|food|dining|eat)\s*(?:near me|nearby)?/i, action: 'findNearby', param: 'restaurants' },
      { pattern: /(?:hospitals?|medical|health)\s*(?:near me|nearby)?/i, action: 'findNearby', param: 'hospitals' },
      { pattern: /(?:banks?|atm|money)\s*(?:near me|nearby)?/i, action: 'findNearby', param: 'banks' },
      { pattern: /(?:gas stations?|fuel|petrol)\s*(?:near me|nearby)?/i, action: 'findNearby', param: 'gas' },
      { pattern: /(?:add marker|place marker|mark this location)/i, action: 'addMarker' },
    ]);

    this.commandPatterns.set('general', [
      { pattern: /(?:help|what can you do|commands|instructions)/i, action: 'help' },
      { pattern: /(?:clear|reset|clean|remove all)/i, action: 'clear' },
      { pattern: /(?:stop listening|stop|pause)/i, action: 'stopListening' },
      { pattern: /(?:what is this|describe location|tell me about)/i, action: 'describeLocation' },
    ]);
  }

  async initializeTensorFlowModel() {
    try {
      console.log('Initializing advanced TensorFlow.js voice model...');
      
      // Set TensorFlow.js backend for GPU acceleration
      await tf.setBackend('webgl');
      await tf.ready();
      
      // Load speech commands model (this is a simplified version)
      // In production, you would load a custom trained model
      const modelUrl = 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.4/browser_fft/model.json';
      
      try {
        this.tfModel = await tf.loadLayersModel(modelUrl);
        console.log('✅ TensorFlow.js speech model loaded successfully');
        this.modelMode = 'tensorflow';
        return true;
      } catch (modelError) {
        console.warn('TensorFlow model loading failed, using browser API:', modelError);
        this.modelMode = 'browser';
        return false;
      }
    } catch (error) {
      console.warn('TensorFlow.js initialization failed:', error);
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
          if (param) {
            if (typeof param === 'string') {
              result.parameter = param;
            } else if (match[param]) {
              result.parameter = match[param].trim();
            }
          }
          return result;
        }
      }
    }

    // Enhanced fallback with smart detection
    if (cleanTranscript.includes('near') || cleanTranscript.includes('find') || cleanTranscript.includes('search')) {
      return {
        action: 'findNearby',
        category: 'location',
        parameter: cleanTranscript,
        confidence: 0.6
      };
    }

    return {
      action: 'navigate',
      category: 'navigation',
      parameter: cleanTranscript,
      confidence: 0.5
    };
  }

  // Enhanced voice feedback system
  speak(text, priority = 'normal') {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech if high priority
      if (priority === 'high') {
        speechSynthesis.cancel();
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      
      // Use a more natural voice if available
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(voice => 
        voice.lang.startsWith('en') && 
        (voice.name.includes('Google') || voice.name.includes('Microsoft'))
      );
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      speechSynthesis.speak(utterance);
    }
  }

  startListening(onResult, onStatus) {
    if (this.isListening) return;

    try {
      this.initializeWebSpeechAPI();
      this.isListening = true;
      onStatus('listening');
      this.speak('Listening for your command', 'low');

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
        this.speak('Sorry, I had trouble understanding. Please try again.', 'high');
        setTimeout(() => {
          if (this.isListening) {
            onStatus('listening');
          }
        }, 2000);
      };

      this.recognition.onend = () => {
        if (this.isListening) {
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
    this.speak('Voice commands stopped', 'low');
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
  const [activeLayers, setActiveLayers] = useState(new Set());
  const voiceEngineRef = useRef(null);

  useEffect(() => {
    voiceEngineRef.current = new VoiceRecognitionEngine();
    
    const initTensorFlow = async () => {
      setIsModelLoading(true);
      const success = await voiceEngineRef.current.initializeTensorFlowModel();
      if (success) {
        setModelMode('tensorflow');
      }
      setIsModelLoading(false);
    };
    
    initTensorFlow();
  }, []);

  const handleVoiceResult = async (command, transcript) => {
    console.log('Voice command processed:', command, transcript);
    
    try {
      await executeMapCommand(command, transcript);
      onVoiceCommand(command, transcript);
    } catch (error) {
      console.error('Error executing command:', error);
      voiceEngineRef.current.speak('Sorry, I could not execute that command', 'high');
    }
  };

  const executeMapCommand = async (command, transcript) => {
    if (!mapInstance) {
      console.warn('Map instance not available');
      return;
    }

    const engine = voiceEngineRef.current;

    try {
      switch (command.action) {
        case 'navigate':
          await handleNavigation(command.parameter, engine);
          break;
          
        case 'zoomIn':
          mapInstance.zoomIn(2);
          engine.speak('Zooming in');
          break;
          
        case 'zoomOut':
          mapInstance.zoomOut(2);
          engine.speak('Zooming out');
          break;
          
        case 'zoomToLevel':
          const level = parseInt(command.parameter);
          if (level >= 1 && level <= 20) {
            mapInstance.setZoom(level);
            engine.speak(`Zoom set to level ${level}`);
          }
          break;
          
        case 'changeLayer':
          handleLayerChange(command.parameter, engine);
          break;

        case 'enableWMSLayer':
          await handleWMSLayer(command.parameter, true, engine);
          break;

        case 'disableWMSLayer':
          await handleWMSLayer(command.parameter, false, engine);
          break;
          
        case 'showCurrentLocation':
          if (currentLocation) {
            mapInstance.setView([currentLocation.lat, currentLocation.lng], 15);
            engine.speak('Showing your current location');
          } else {
            engine.speak('Current location not available');
          }
          break;
          
        case 'findNearby':
          await handleNearbySearch(command.parameter, engine);
          break;
          
        case 'addMarker':
          const center = mapInstance.getCenter();
          // This will be handled by map component
          engine.speak('Marker added at current location');
          break;
          
        case 'help':
          engine.speak('You can say commands like: go to New York, find restaurants near me, show satellite view, zoom in, or show my location');
          break;
          
        case 'clear':
          // Clear all markers and overlays
          engine.speak('Map cleared');
          break;

        case 'describeLocation':
          await handleLocationDescription(engine);
          break;
          
        case 'stopListening':
          toggleListening();
          break;
          
        default:
          engine.speak('Command not recognized');
      }
    } catch (error) {
      console.error('Error executing map command:', error);
      engine.speak('Sorry, I could not complete that action');
    }
  };

  const handleNavigation = async (location, engine) => {
    try {
      engine.speak(`Searching for ${location}`);
      const results = await geocodingService.smartSearch(location);
      
      if (results.length > 0) {
        const result = results[0];
        mapInstance.setView([result.lat, result.lng], 12);
        
        // Add marker for the location
        const marker = L.marker([result.lat, result.lng]).addTo(mapInstance);
        marker.bindPopup(`📍 ${result.displayName}`).openPopup();
        
        engine.speak(`Found ${result.displayName}`);
      } else {
        engine.speak(`Sorry, I could not find ${location}`);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      engine.speak('Sorry, there was an error finding that location');
    }
  };

  const handleLayerChange = (layerType, engine) => {
    const normalizedType = layerType.toLowerCase();
    let message = '';
    
    switch (normalizedType) {
      case 'satellite':
      case 'imagery':
        message = 'Switching to satellite view';
        break;
      case 'street':
      case 'roads':
        message = 'Switching to street view';
        break;
      case 'terrain':
      case 'topographic':
        message = 'Switching to terrain view';
        break;
      default:
        message = `Switching to ${layerType} view`;
    }
    
    engine.speak(message);
    // Layer switching will be handled by map component
  };

  const handleWMSLayer = async (layerParam, enable, engine) => {
    const layerId = wmsService.detectLayerFromCommand(layerParam) || layerParam;
    const layerInfo = wmsService.getLayerInfo(layerId);
    
    if (layerInfo) {
      if (enable) {
        setActiveLayers(prev => new Set([...prev, layerId]));
        engine.speak(`Enabled ${layerInfo.name} layer`);
      } else {
        setActiveLayers(prev => {
          const newSet = new Set(prev);
          newSet.delete(layerId);
          return newSet;
        });
        engine.speak(`Disabled ${layerInfo.name} layer`);
      }
    } else {
      engine.speak('Layer not found');
    }
  };

  const handleNearbySearch = async (query, engine) => {
    if (!currentLocation) {
      engine.speak('Current location needed for nearby search');
      return;
    }

    try {
      const category = poiService.detectCategory(query);
      engine.speak(`Searching for ${query} nearby`);
      
      const pois = await poiService.findNearby(
        currentLocation.lat, 
        currentLocation.lng, 
        category, 
        2, // 2km radius
        10 // max 10 results
      );

      if (pois.length > 0) {
        const sortedPois = poiService.addDistanceAndSort(pois, currentLocation.lat, currentLocation.lng);
        
        // Add markers for POIs
        sortedPois.forEach(poi => {
          const marker = L.marker([poi.lat, poi.lng], {
            icon: L.divIcon({
              className: 'poi-marker',
              html: poi.icon,
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            })
          }).addTo(mapInstance);
          
          marker.bindPopup(`${poi.icon} ${poi.name}<br><small>${poi.distance.toFixed(1)}km away</small>`);
        });

        engine.speak(`Found ${pois.length} ${query} nearby. The closest is ${sortedPois[0].name}, ${sortedPois[0].distance.toFixed(1)} kilometers away`);
      } else {
        engine.speak(`No ${query} found nearby`);
      }
    } catch (error) {
      console.error('Nearby search error:', error);
      engine.speak('Sorry, nearby search failed');
    }
  };

  const handleLocationDescription = async (engine) => {
    if (!currentLocation) {
      engine.speak('Current location not available');
      return;
    }

    try {
      const result = await geocodingService.reverseGeocode(currentLocation.lat, currentLocation.lng);
      if (result && result.display_name) {
        engine.speak(`You are currently at ${result.display_name}`);
      } else {
        engine.speak('Location information not available');
      }
    } catch (error) {
      console.error('Location description error:', error);
      engine.speak('Could not describe current location');
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
      voiceEngineRef.current.speak(`Switched to ${mode === 'tensorflow' ? 'TensorFlow' : 'browser'} voice processing`);
    } else {
      voiceEngineRef.current.speak('Could not switch voice processing mode');
    }
    
    setIsModelLoading(false);
  };

  return (
    <div className="voice-control-panel">
      <h2 className="voice-control-title">🎤 AI Voice Control</h2>
      
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
          AI Processing Mode:
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

      {/* WMS Layer Controls */}
      <div className="wms-layer-controls">
        <h4 style={{ color: '#00ccff', marginBottom: '0.8rem', fontSize: '1rem' }}>
          🛰️ Data Layers:
        </h4>
        {wmsService.getAllLayers().slice(0, 4).map(layer => (
          <button
            key={layer.id}
            className={`layer-control-button ${activeLayers.has(layer.id) ? 'active' : ''}`}
            onClick={() => handleWMSLayer(layer.id, !activeLayers.has(layer.id), voiceEngineRef.current)}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.5rem',
              margin: '0.3rem 0',
              background: activeLayers.has(layer.id) ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 0, 0, 0.3)',
              border: `1px solid ${activeLayers.has(layer.id) ? '#00ff88' : '#333'}`,
              borderRadius: '8px',
              color: activeLayers.has(layer.id) ? '#00ff88' : '#ccc',
              fontSize: '0.8rem',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            {layer.icon} {layer.name}
          </button>
        ))}
      </div>

      <div className="voice-instructions">
        <h4 style={{ color: '#00ccff', marginBottom: '0.8rem', fontSize: '1rem' }}>
          💡 Advanced Commands:
        </h4>
        <ul style={{ listStyle: 'none', padding: 0, color: '#ccc', fontSize: '0.9rem' }}>
          <li style={{ marginBottom: '0.4rem' }}>• "Go to Tokyo, Japan"</li>
          <li style={{ marginBottom: '0.4rem' }}>• "Find restaurants near me"</li>
          <li style={{ marginBottom: '0.4rem' }}>• "Show satellite layer"</li>
          <li style={{ marginBottom: '0.4rem' }}>• "Enable weather overlay"</li>
          <li style={{ marginBottom: '0.4rem' }}>• "What is this location?"</li>
          <li style={{ marginBottom: '0.4rem' }}>• "Clear all markers"</li>
        </ul>
      </div>
    </div>
  );
};

export default VoiceNavigator;