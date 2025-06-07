import React from 'react';

const DebugPanel = ({ activeLayers, wmsService }) => {
  const layers = Array.from(activeLayers || []);
  
  return (
    <div className="debug-panel">
      <div className="debug-header">
        <h3>Active Layers</h3>
      </div>
      <div className="debug-content">
        {layers.length === 0 ? (
          <p>No active layers</p>
        ) : (
          <ul className="layer-list">
            {layers.map(layerId => {
              const layer = wmsService.getLayer(layerId);
              return (
                <li key={layerId} className="layer-item">
                  {layer ? layer.name : layerId}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DebugPanel;