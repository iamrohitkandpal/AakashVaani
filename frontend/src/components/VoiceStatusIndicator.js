import React, { useState, useEffect } from "react";

/**
 * Component to visually indicate the current status of voice recognition
 * @param {string} status - Current voice recognition status: 'idle', 'listening', 'processing', 'error'
 */
const VoiceStatusIndicator = ({ status }) => {
  const [blinkClass, setBlinkClass] = useState("");

  // Configure visual appearance based on status
  const getStatusConfig = () => {
    switch (status) {
      case "listening":
        return {
          color: "#4CAF50",
          icon: "🎤",
          label: "Listening",
          pulse: true,
        };
      case "processing":
        return {
          color: "#2196F3",
          icon: "⏳",
          label: "Processing",
          pulse: false,
        };
      case "speaking":
        return {
          color: "#9C27B0",
          icon: "🔊",
          label: "Speaking",
          pulse: true,
        };
      case "error":
        return {
          color: "#F44336",
          icon: "⚠️",
          label: "Error",
          pulse: false,
        };
      case "idle":
      default:
        return {
          color: "#757575",
          icon: "🎙️",
          label: "Idle",
          pulse: false,
        };
    }
  };

  const statusConfig = getStatusConfig();

  // Manage pulsing effect
  useEffect(() => {
    if (statusConfig.pulse) {
      setBlinkClass("pulse");
    } else {
      setBlinkClass("");
    }

    // Clean up animation when component unmounts or status changes
    return () => {
      setBlinkClass("");
    };
  }, [status, statusConfig.pulse]);

  return (
    <div className="voice-status-indicator">
      <div
        className={`status-badge ${blinkClass}`}
        style={{ backgroundColor: statusConfig.color }}
      >
        <span className="status-icon">{statusConfig.icon}</span>
        <span className="status-label">{statusConfig.label}</span>
      </div>
    </div>
  );
};

export default React.memo(VoiceStatusIndicator);