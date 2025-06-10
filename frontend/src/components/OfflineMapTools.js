import React, { useState, useEffect } from 'react';

const OfflineMapTools = ({ map, isOnline }) => {
  const [showAreasList, setShowAreasList] = useState(false);
  const [savedAreas, setSavedAreas] = useState([]);
  const [downloadInProgress, setDownloadInProgress] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  useEffect(() => {
    loadSavedAreas();
  }, []);
  
  useEffect(() => {
    const getLastUpdate = async () => {
      try {
        // Try from IndexedDB first (if service worker managed it)
        const db = await openOfflineDatabase();
        try {
          const timestamp = await db.get('meta', 'last-cache-update');
          if (timestamp) {
            setLastUpdate(new Date(parseInt(timestamp, 10)));
            return;
          }
        } catch (e) {
          console.log('No service worker cache info found');
        }
        
        // Fall back to localStorage
        const localUpdateStr = localStorage.getItem('last-cache-update');
        if (localUpdateStr) {
          setLastUpdate(new Date(parseInt(localUpdateStr, 10)));
        }
      } catch (error) {
        console.error('Error getting last update time:', error);
      }
    };
    
    getLastUpdate();
  }, []);
  
  const loadSavedAreas = async () => {
    try {
      const db = await openOfflineDatabase();
      const areas = await db.getAll('map-areas');
      setSavedAreas(areas);
    } catch (error) {
      console.error('Failed to load offline map areas:', error);
    }
  };
  
  const saveCurrentMapArea = async () => {
    if (!map) return;
    
    try {
      setDownloadInProgress(true);
      const bounds = map.getBounds();
      const center = map.getCenter();
      const zoom = map.getZoom();
      
      const areaInfo = {
        id: `area-${Date.now()}`,
        name: `Area at ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`,
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        },
        center: { lat: center.lat, lng: center.lng },
        zoom: zoom,
        timestamp: new Date().toISOString()
      };
      
      // Download tiles for offline use
      await downloadMapTiles(bounds, Math.min(zoom + 2, 18), Math.max(zoom - 2, 1));
      
      // Save area info to IndexedDB
      const db = await openOfflineDatabase();
      await db.put('map-areas', areaInfo);
      
      // Refresh list
      await loadSavedAreas();
      setDownloadInProgress(false);
      
      return true;
    } catch (error) {
      console.error('Failed to save map area:', error);
      setDownloadInProgress(false);
      return false;
    }
  };
  
  const downloadMapTiles = async (bounds, maxZoom, minZoom) => {
    const tileLayers = [
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png',
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ];
    
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    
    // Add progress tracking
    let totalTiles = 0;
    let downloadedTiles = 0;
    
    // Calculate total tiles first
    for (let z = minZoom; z <= maxZoom; z++) {
      const x1 = Math.floor((sw.lng + 180) / 360 * Math.pow(2, z));
      const x2 = Math.floor((ne.lng + 180) / 360 * Math.pow(2, z));
      const y1 = Math.floor((1 - Math.log(Math.tan(ne.lat * Math.PI / 180) + 1 / Math.cos(ne.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
      const y2 = Math.floor((1 - Math.log(Math.tan(sw.lat * Math.PI / 180) + 1 / Math.cos(sw.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
      
      // Calculate tile coordinates...
      const tilesX = Math.max(x1, x2) - Math.min(x1, x2) + 1;
      const tilesY = Math.max(y1, y2) - Math.min(y1, y2) + 1;
      totalTiles += tilesX * tilesY * tileLayers.length;
    }
    
    // Create progress element
    const progressDiv = document.createElement('div');
    progressDiv.className = 'tile-download-progress';
    progressDiv.style = 'position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.7); color:white; padding:10px; border-radius:5px; z-index:1000;';
    document.body.appendChild(progressDiv);
    
    // Download tiles with progress updates
    try {
      for (let z = minZoom; z <= maxZoom; z++) {
        const x1 = Math.floor((sw.lng + 180) / 360 * Math.pow(2, z));
        const x2 = Math.floor((ne.lng + 180) / 360 * Math.pow(2, z));
        const y1 = Math.floor((1 - Math.log(Math.tan(ne.lat * Math.PI / 180) + 1 / Math.cos(ne.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
        const y2 = Math.floor((1 - Math.log(Math.tan(sw.lat * Math.PI / 180) + 1 / Math.cos(sw.lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
        
        for (const tileTemplate of tileLayers) {
          for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
              const url = tileTemplate
                .replace('{z}', z)
                .replace('{x}', x)
                .replace('{y}', y)
                .replace('{s}', ['a', 'b', 'c'][Math.floor(Math.random() * 3)]);
              
              try {
                const cache = await caches.open('map-tiles-v2');
                const response = await fetch(url, { mode: 'cors' });
                if (response.ok) {
                  await cache.put(url, response.clone());
                  downloadedTiles++;
                } else {
                  failedTiles++;
                }
              } catch (e) {
                console.warn(`Failed to cache tile: ${url}`, e);
                failedTiles++;
              }
              
              // Update progress
              progressDiv.textContent = `Downloading tiles: ${downloadedTiles}/${totalTiles} (${Math.round(downloadedTiles/totalTiles*100)}%)`;
            }
          }
        }
      }
    } finally {
      // Remove progress indicator when done
      document.body.removeChild(progressDiv);
    }
    
    console.log(`Downloaded ${downloadedTiles} tiles, ${failedTiles} failed`);
    return downloadedTiles > 0;
  };
  
  const openOfflineDatabase = async () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('aakash-vaani-offline', 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('map-areas')) {
          const store = db.createObjectStore('map-areas', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const dbWrapper = {
          put: (storeName, value) => {
            return new Promise((resolve, reject) => {
              const transaction = db.transaction([storeName], 'readwrite');
              const store = transaction.objectStore(storeName);
              const putRequest = store.put(value);
              
              putRequest.onsuccess = () => resolve(putRequest.result);
              putRequest.onerror = () => reject(putRequest.error);
            });
          },
          getAll: (storeName) => {
            return new Promise((resolve, reject) => {
              const transaction = db.transaction([storeName], 'readonly');
              const store = transaction.objectStore(storeName);
              const getAllRequest = store.getAll();
              
              getAllRequest.onsuccess = () => resolve(getAllRequest.result);
              getAllRequest.onerror = () => reject(getAllRequest.error);
            });
          },
          delete: (storeName, key) => {
            return new Promise((resolve, reject) => {
              const transaction = db.transaction([storeName], 'readwrite');
              const store = transaction.objectStore(storeName);
              const deleteRequest = store.delete(key);
              
              deleteRequest.onsuccess = () => resolve(deleteRequest.result);
              deleteRequest.onerror = () => reject(deleteRequest.error);
            });
          },
          close: () => db.close()
        };
        
        resolve(dbWrapper);
      };
      
      request.onerror = () => reject(request.error);
    });
  };
  
  const deleteArea = async (areaId) => {
    try {
      const db = await openOfflineDatabase();
      await db.delete('map-areas', areaId);
      await loadSavedAreas();
    } catch (error) {
      console.error('Failed to delete map area:', error);
    }
  };
  
  const goToArea = (area) => {
    if (!map) return;
    
    const { center, zoom } = area;
    map.setView([center.lat, center.lng], zoom);
    setShowAreasList(false);
  };
  
  return (
    <div className="offline-map-tools">
      {!showAreasList ? (
        <>
          <button 
            className="offline-map-button"
            onClick={() => setShowAreasList(true)}
            title="Show saved offline areas"
          >
            <span>📁</span> Offline Areas ({savedAreas.length})
          </button>
          
          <button 
            className="offline-map-button"
            onClick={saveCurrentMapArea}
            disabled={!isOnline || downloadInProgress}
            title={isOnline ? "Save current map area for offline use" : "Can't save areas while offline"}
          >
            <span>{downloadInProgress ? '⏳' : '💾'}</span> 
            {downloadInProgress ? 'Saving...' : 'Save Current Area'}
          </button>
        </>
      ) : (
        <div className="offline-area-list">
          <h3>Saved Map Areas</h3>
          
          {savedAreas.length === 0 ? (
            <p>No areas saved for offline use</p>
          ) : (
            savedAreas.map(area => (
              <div key={area.id} className="offline-area-item">
                <span className="area-name" onClick={() => goToArea(area)}>
                  {area.name}
                </span>
                <button 
                  className="delete-area" 
                  onClick={() => deleteArea(area.id)}
                  title="Delete this offline area"
                >
                  ❌
                </button>
              </div>
            ))
          )}
          
          <button 
            className="offline-map-button"
            onClick={() => setShowAreasList(false)}
            style={{ marginTop: '10px' }}
          >
            Close
          </button>
        </div>
      )}
      
      {isOnline && lastUpdate && (
        <div className="cache-status">
          <span>Last updated: {lastUpdate.toLocaleString()}</span>
          {new Date() - lastUpdate > 24 * 60 * 60 * 1000 && (
            <span className="update-needed">⚠️ Update needed</span>
          )}
        </div>
      )}
    </div>
  );
};

export default OfflineMapTools;