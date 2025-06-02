import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import { wmsService } from "../services/WMSService";
import { geocodingService } from "../services/GeocodingService";
import { poiService } from "../services/POIService";
import * as tf from "@tensorflow/tfjs";

// Voice Recognition Engine for advanced voice processing
class VoiceRecognitionEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.commandPatterns = new Map();
    this.modelMode = "browser";
    this.tfModel = null;

    this.initializeCommandPatterns();
    this.initializeWebSpeechAPI();
  }

  initializeCommandPatterns() {
    // Navigation commands
    this.commandPatterns.set("navigation", [
      {
        pattern: /(?:go to|navigate to|show me|find|locate|take me to)\s+(.+)/i,
        action: "navigate",
        param: 1,
      },
      { pattern: /(?:zoom in|zoom closer)/i, action: "zoomIn" },
      { pattern: /(?:zoom out|zoom back)/i, action: "zoomOut" },
      {
        pattern: /(?:zoom to level|set zoom)\s+(\d+)/i,
        action: "zoomToLevel",
        param: 1,
      },
      {
        pattern: /(?:center on|focus on)\s+(.+)/i,
        action: "navigate",
        param: 1,
      },
    ]);

    // Layer commands
    this.commandPatterns.set("layers", [
      {
        pattern:
          /(?:show|switch to|change to|enable)\s+(satellite|street|terrain|hybrid|dark|light)\s*(?:view|layer|map|mode)?/i,
        action: "changeLayer",
        param: 1,
      },
      {
        pattern: /(?:show|enable|turn on)\s+(.+?)\s*(?:layer|overlay)/i,
        action: "enableWMSLayer",
        param: 1,
      },
      {
        pattern: /(?:hide|disable|turn off)\s+(.+?)\s*(?:layer|overlay)/i,
        action: "disableWMSLayer",
        param: 1,
      },
      {
        pattern: /(?:nasa|satellite imagery|modis)/i,
        action: "enableWMSLayer",
        param: "nasa_modis_terra",
      },
      {
        pattern: /(?:weather|precipitation|rain)/i,
        action: "enableWMSLayer",
        param: "openweather_precipitation",
      },
      {
        pattern: /(?:clouds|cloud cover)/i,
        action: "enableWMSLayer",
        param: "openweather_clouds",
      },
      {
        pattern: /(?:terrain|elevation|topographic)/i,
        action: "enableWMSLayer",
        param: "stamen_terrain",
      },
    ]);

    // Location commands
    this.commandPatterns.set("location", [
      {
        pattern: /(?:where am i|show my location|current location)/i,
        action: "showCurrentLocation",
      },
      {
        pattern:
          /(?:find|search for|show me|locate)\s+(.+?)\s*(?:near me|nearby)/i,
        action: "findNearby",
        param: 1,
      },
      {
        pattern: /(?:restaurants?|food|dining|eat)\s*(?:near me|nearby)?/i,
        action: "findNearby",
        param: "restaurants",
      },
      {
        pattern: /(?:hospitals?|medical|health)\s*(?:near me|nearby)?/i,
        action: "findNearby",
        param: "hospitals",
      },
      {
        pattern: /(?:banks?|atm|money)\s*(?:near me|nearby)?/i,
        action: "findNearby",
        param: "banks",
      },
      {
        pattern: /(?:gas stations?|fuel|petrol)\s*(?:near me|nearby)?/i,
        action: "findNearby",
        param: "gas",
      },
      {
        pattern: /(?:add marker|place marker|mark this location)/i,
        action: "addMarker",
      },
    ]);

    // General commands
    this.commandPatterns.set("general", [
      {
        pattern: /(?:help|what can you do|commands|instructions)/i,
        action: "help",
      },
      { pattern: /(?:clear|reset|clean|remove all)/i, action: "clear" },
      { pattern: /(?:stop listening|stop|pause)/i, action: "stopListening" },
      {
        pattern: /(?:what is this|describe location|tell me about)/i,
        action: "describeLocation",
      },
    ]);
  }

  async initializeTensorFlowModel() {
    try {
      console.log("Initializing TensorFlow.js voice model...");

      // Set TensorFlow.js backend for GPU acceleration when available
      await tf.ready();
      const backendName = tf.getBackend();
      console.log(`Using TensorFlow.js backend: ${backendName}`);

      // Try to load model from multiple sources with error handling
      const modelUrls = [
        "https://storage.googleapis.com/tfjs-speech-commands-models/speech-commands-browser/v0.4/model.json",
        "https://unpkg.com/@tensorflow-models/speech-commands@0.4.0/dist/speech-commands.min.js",
      ];

      for (const url of modelUrls) {
        try {
          console.log(`Attempting to load model from: ${url}`);
          this.tfModel = await tf.loadLayersModel(url);
          console.log("✅ TensorFlow.js speech model loaded successfully");
          this.modelMode = "tensorflow";
          return true;
        } catch (modelError) {
          console.warn(`Failed to load from ${url}: ${modelError.message}`);
          // Continue to next URL
        }
      }

      // Fallback to browser API
      console.warn("All model loading attempts failed, using browser API");
      this.modelMode = "browser";
      return false;
    } catch (error) {
      console.warn("TensorFlow.js initialization failed:", error);
      this.modelMode = "browser";
      return false;
    }
  }

  initializeWebSpeechAPI() {
    // Initialize Web Speech API with fallback
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = "en-US";
    } else {
      console.error("Speech recognition not supported in this browser.");
    }
  }

  parseCommand(transcript) {
    const cleanTranscript = transcript.toLowerCase().trim();

    // Try to match against command patterns
    for (const [category, patterns] of this.commandPatterns) {
      for (const { pattern, action, param } of patterns) {
        const match = cleanTranscript.match(pattern);
        if (match) {
          const result = { action, category, confidence: 1.0 };
          if (param) {
            if (typeof param === "string") {
              result.parameter = param;
            } else if (match[param]) {
              result.parameter = match[param].trim();
            }
          }
          return result;
        }
      }
    }

    // Smart fallbacks for commands that don't match exactly
    if (
      cleanTranscript.includes("near") ||
      cleanTranscript.includes("find") ||
      cleanTranscript.includes("search")
    ) {
      return {
        action: "findNearby",
        category: "location",
        parameter: cleanTranscript,
        confidence: 0.6,
      };
    }

    // Default to navigation as fallback
    return {
      action: "navigate",
      category: "navigation",
      parameter: cleanTranscript,
      confidence: 0.5,
    };
  }

  // Enhanced voice feedback system
  speak(text, priority = "normal") {
    if ("speechSynthesis" in window) {
      // Cancel any ongoing speech if high priority
      if (priority === "high") {
        speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;

      // Only get voices if we need to - performance optimization
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (voice) =>
          voice.lang.startsWith("en") &&
          (voice.name.includes("Google") || voice.name.includes("Microsoft"))
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      speechSynthesis.speak(utterance);
    }
  }

  startListening(onResult, onStatus) {
    if (!this.recognition) {
      console.error("Speech recognition not initialized");
      return;
    }

    if (this.isListening) {
      return;
    }

    this.isListening = true;

    this.recognition.onstart = () => {
      onStatus("listening");
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;

      console.log("Voice transcript:", transcript, "Confidence:", confidence);

      onStatus("processing");

      // Process the command
      const command = this.parseCommand(transcript);

      onResult(command, transcript);

      onStatus("success");
      this.isListening = false;
    };

    this.recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      onStatus("error");
      this.isListening = false;
    };

    this.recognition.onend = () => {
      this.isListening = false;
      // Don't set status to idle here as it might override success/error states
    };

    // Start listening
    this.recognition.start();
  }

  stopListening(onStatus) {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      onStatus("idle");
    }
  }

  async switchModel(mode) {
    if (mode === "tensorflow" && !this.tfModel) {
      return await this.initializeTensorFlowModel();
    } else if (mode === "browser") {
      this.modelMode = "browser";
      return true;
    }
    return false;
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
  const [isListening, setIsListening] = useState(false);
  const [modelMode, setModelMode] = useState("browser");
  const [isModelLoading, setIsModelLoading] = useState(false);
  const voiceEngineRef = useRef(null);

  // Initialize voice recognition engine once
  useEffect(() => {
    voiceEngineRef.current = new VoiceRecognitionEngine();

    const initTensorFlow = async () => {
      setIsModelLoading(true);
      const success = await voiceEngineRef.current.initializeTensorFlowModel();

      if (success) {
        setModelMode("tensorflow");
      }
      setIsModelLoading(false);
    };

    initTensorFlow();
  }, []);

  // Memoize handlers to prevent unnecessary re-renders
  const handleVoiceResult = useCallback(
    async (command, transcript) => {
      console.log("Voice command processed:", command, transcript);

      try {
        await executeMapCommand(command, transcript);
        onVoiceCommand(command, transcript);
      } catch (error) {
        console.error("Error executing command:", error);
        voiceEngineRef.current.speak(
          "Sorry, I could not execute that command",
          "high"
        );
      }
    },
    [onVoiceCommand, mapInstance, currentLocation]
  );

  const executeMapCommand = async (command, transcript) => {
    if (!mapInstance) {
      console.warn("Map instance not available");
      return;
    }

    const engine = voiceEngineRef.current;

    try {
      switch (command.action) {
        case "navigate":
          await handleNavigation(command.parameter, engine);
          break;

        case "zoomIn":
          mapInstance.zoomIn(1);
          engine.speak("Zooming in");
          break;

        case "zoomOut":
          mapInstance.zoomOut(1);
          engine.speak("Zooming out");
          break;

        case "zoomToLevel":
          const level = parseInt(command.parameter, 10);
          if (!isNaN(level) && level >= 0 && level <= 19) {
            mapInstance.setZoom(level);
            engine.speak(`Setting zoom level to ${level}`);
          } else {
            engine.speak("Invalid zoom level");
          }
          break;

        case "changeLayer":
          handleLayerChange(command.parameter, engine);
          break;

        case "enableWMSLayer":
          await handleWMSLayer(command.parameter, true, engine);
          break;

        case "disableWMSLayer":
          await handleWMSLayer(command.parameter, false, engine);
          break;

        case "showCurrentLocation":
          if (currentLocation) {
            mapInstance.setView([currentLocation.lat, currentLocation.lng], 15);
            engine.speak("Showing your current location");
          } else {
            engine.speak(
              "Your location is not available. Please enable location services."
            );
          }
          break;

        case "findNearby":
          await handleNearbySearch(command.parameter, engine);
          break;

        case "addMarker":
          if (currentLocation) {
            const marker = L.marker([
              currentLocation.lat,
              currentLocation.lng,
            ]).addTo(mapInstance);
            marker.bindPopup("Marker placed at your location").openPopup();
            engine.speak("Marker added at your current location");
          } else {
            engine.speak("Cannot add marker. Your location is not available.");
          }
          break;

        case "help":
          document.querySelector(".help-button")?.click();
          engine.speak("Showing voice command help guide");
          break;

        case "clear":
          // Remove all markers and overlays
          mapInstance.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.Circle) {
              mapInstance.removeLayer(layer);
            }
          });
          engine.speak("Clearing all markers from the map");
          break;

        case "describeLocation":
          await handleLocationDescription(engine);
          break;

        case "stopListening":
          engine.stopListening(onStatusChange);
          engine.speak("Voice recognition paused");
          break;

        default:
          engine.speak(
            `I heard: ${transcript}. Please try a different command.`
          );
          break;
      }
    } catch (error) {
      console.error("Error executing map command:", error);
      engine.speak("Sorry, I could not complete that action");
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
      console.error("Navigation error:", error);
      engine.speak("Sorry, there was an error finding that location");
    }
  };

  const handleLayerChange = (layerType, engine) => {
    // Map layer type from voice to actual layer ID
    const layerMapping = {
      satellite: "satellite",
      street: "street",
      terrain: "terrain",
      hybrid: "hybrid",
      dark: "dark",
      light: "cartodb_positron",
    };

    const normalizedType = layerType.toLowerCase();
    const actualLayerId = layerMapping[normalizedType] || normalizedType;

    // Update base layer via map controller
    if (mapInstance && mapInstance.setBaseLayer) {
      mapInstance.setBaseLayer(actualLayerId);
      engine.speak(`Switched to ${normalizedType} view`);
    } else {
      // Fallback to use a custom event
      const event = new CustomEvent("changeMapLayer", {
        detail: { layer: actualLayerId },
      });
      document.dispatchEvent(event);
      engine.speak(`Switching to ${normalizedType} view`);
    }
  };

  const handleWMSLayer = async (layerParam, enable, engine) => {
    // Try to detect which layer the user is referring to
    let layerId = layerParam;

    if (typeof layerParam === "string" && !layerParam.includes("_")) {
      // This is likely a descriptive term, not an ID
      const detectedLayer = wmsService.detectLayerFromCommand(layerParam);
      if (detectedLayer) {
        layerId = detectedLayer;
      }
    }

    // Get layer information
    const layerInfo = wmsService.getLayerInfo(layerId);

    if (layerInfo) {
      // Update the layer state via callback
      onLayerChange(layerId, enable);

      // Provide voice feedback
      if (enable) {
        engine.speak(`Enabling ${layerInfo.name} layer`);
      } else {
        engine.speak(`Disabling ${layerInfo.name} layer`);
      }
    } else {
      engine.speak(`Sorry, I couldn't find the ${layerParam} layer`);
    }
  };

  const handleNearbySearch = async (query, engine) => {
    if (!currentLocation) {
      engine.speak(
        "Your location is not available. Please enable location services."
      );
      return;
    }

    try {
      engine.speak(`Searching for ${query} nearby`);

      // Detect category from query
      let category = query;
      if (typeof query === "string" && query.length > 10) {
        // This is likely a full sentence, try to extract the category
        category = poiService.detectCategory(query) || query;
      }

      // Search for POIs
      const pois = await poiService.findNearby(
        currentLocation.lat,
        currentLocation.lng,
        category,
        2 // 2km radius
      );

      if (pois.length > 0) {
        // Add markers for found POIs
        pois.forEach((poi) => {
          const marker = L.marker([poi.lat, poi.lng]).addTo(mapInstance);

          let popupContent = `<b>${poi.name}</b>`;
          if (poi.type) popupContent += `<br><small>${poi.type}</small>`;
          if (poi.address) popupContent += `<br>${poi.address}`;
          if (poi.distance)
            popupContent += `<br><small>Distance: ${poi.distance.toFixed(
              2
            )} km</small>`;

          marker.bindPopup(popupContent);
        });

        // Create bounds for all markers
        const bounds = L.latLngBounds(pois.map((poi) => [poi.lat, poi.lng]));
        mapInstance.fitBounds(bounds, { padding: [50, 50] });

        engine.speak(`Found ${pois.length} ${category} locations nearby`);
      } else {
        engine.speak(`Sorry, I couldn't find any ${category} near you`);
      }
    } catch (error) {
      console.error("Error searching nearby:", error);
      engine.speak("Sorry, there was an error searching for places nearby");
    }
  };

  const handleLocationDescription = async (engine) => {
    if (!currentLocation) {
      engine.speak("Your location information is not available");
      return;
    }

    try {
      const result = await geocodingService.reverseGeocode(
        currentLocation.lat,
        currentLocation.lng
      );

      if (result && result.displayName) {
        engine.speak(`You are at ${result.displayName}`);
      } else {
        engine.speak("I cannot determine your exact location");
      }
    } catch (error) {
      console.error("Error describing location:", error);
      engine.speak("I cannot describe your location at this moment");
    }
  };

  const toggleListening = useCallback(() => {
    if (isListening) {
      voiceEngineRef.current.stopListening(onStatusChange);
      setIsListening(false);
    } else {
      voiceEngineRef.current.startListening(handleVoiceResult, onStatusChange);
      setIsListening(true);
    }
  }, [isListening, handleVoiceResult, onStatusChange]);

  const switchVoiceModel = useCallback(
    async (mode) => {
      if (isModelLoading) return;

      setIsModelLoading(true);
      const success = await voiceEngineRef.current.switchModel(mode);

      if (success) {
        setModelMode(mode);
        voiceEngineRef.current.speak(`Switched to ${mode} voice recognition`);
      } else {
        voiceEngineRef.current.speak(
          `Failed to switch to ${mode} voice recognition`
        );
      }

      setIsModelLoading(false);
    },
    [isModelLoading]
  );

  // Memoize the layers to prevent unnecessary re-renders
  const availableLayers = useMemo(() => wmsService.getAllLayers().slice(0, 4), []);

  return (
    <div className="voice-control-panel">
      {/* Voice Control Title */}
      <h2 className="voice-control-title">
        <span>🎤</span> Voice Navigation
      </h2>

      {/* Main Voice Button */}
      <button
        className={`voice-button ${isListening ? "listening" : ""}`}
        onClick={toggleListening}
        disabled={isModelLoading}
        aria-label={isListening ? "Stop listening" : "Start voice command"}
      >
        <div className="button-icon">{isListening ? "🔴" : "🎙️"}</div>
        {isListening
          ? "Listening... Tap to Stop"
          : isModelLoading
          ? "Loading AI Model..."
          : "Tap to Speak"}
      </button>

      {/* Model Selector */}
      <div className="voice-model-selector">
        <div className="model-selector-title">Recognition Engine:</div>
        <div className="model-options">
          <div
            className={`model-option ${modelMode === "browser" ? "active" : ""}`}
            onClick={() => switchVoiceModel("browser")}
          >
            Browser API
          </div>
          <div
            className={`model-option ${modelMode === "tensorflow" ? "active" : ""}`}
            onClick={() => switchVoiceModel("tensorflow")}
          >
            TensorFlow
          </div>
        </div>
      </div>

      {/* Data Layers Section */}
      <div className="data-layers-section">
        <h3 className="data-layers-title">
          <span>🛰️</span> Data Layers
        </h3>
        <div className="data-layer-list">
          {availableLayers.map((layer) => (
            <div
              key={layer.id}
              className={`data-layer-item ${
                activeLayers.has(layer.id) ? "active" : ""
              }`}
              onClick={() =>
                handleWMSLayer(
                  layer.id,
                  !activeLayers.has(layer.id),
                  voiceEngineRef.current
                )
              }
            >
              <span className="data-layer-icon">{layer.icon}</span>
              <span>{layer.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sample Commands */}
      <div className="sample-commands">
        <div className="sample-commands-title">Try saying:</div>
        <div className="sample-command-list">
          <div className="sample-command-item">"Navigate to Central Park"</div>
          <div className="sample-command-item">"Find restaurants near me"</div>
          <div className="sample-command-item">"Show satellite view"</div>
          <div className="sample-command-item">"Where am I right now?"</div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VoiceNavigator);
