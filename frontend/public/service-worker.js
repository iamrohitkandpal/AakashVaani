const CACHE_NAME = 'aakash-vaani-v2';
const APP_SHELL_CACHE = 'app-shell-v2';
const API_CACHE = 'api-data-v2';
const MAP_TILES_CACHE = 'map-tiles-v2';
const MODEL_CACHE = 'tf-models-v2';

// Add these constants at the top
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const LAST_CACHE_UPDATE_KEY = 'last-cache-update';

// App shell - critical resources needed for basic functionality
const APP_SHELL_RESOURCES = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/static/js/main.*.js',
  '/static/css/main.*.css',
  '/static/media/*.*',
  '/favicon.ico'
];

// Known map tile providers to cache
const TILE_PROVIDERS = [
  'tile.openstreetmap.org', // Covers OpenStreetMap
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'tile.thunderforest.com', // Covers Thunderforest layers
  'server.arcgisonline.com', // Covers ESRI Satellite, ESRI World Imagery
  'cartodb-basemaps.global.ssl.fastly.net', // Covers CartoDB Positron/Dark Matter (check exact hostname if {s} is used)
  'stamen-tiles.a.ssl.fastly.net', // Covers Stamen Terrain/Toner/Watercolor (check exact hostname if {s} is used)
  'tile.opentopomap.org', // Covers OpenTopoMap
  'tile.openweathermap.org', // Covers OpenWeatherMap layers
  'gibs.earthdata.nasa.gov', // Covers NASA GIBS layers
  'tiles.openseamap.org', // Covers OpenSeaMap
  'tile.openstreetmap.fr', // Covers CyclOSM, HOT OSM (and subdomains like a.tile.openstreetmap.fr)
  'a.tile.openstreetmap.fr',
  'b.tile.openstreetmap.fr',
  'c.tile.openstreetmap.fr',
  'tile-cyclosm.openstreetmap.fr', // Specific for CyclOSM if it uses this domain
  'tiles.openrailwaymap.org', // Covers OpenRailwayMap
  'bhuvan-vec1.nrsc.gov.in', // Bhuvan Vector
  'bhuvan-ras1.nrsc.gov.in', // Bhuvan Raster
  'nrsc.gov.in', // General Bhuvan domain if other subdomains are used
  // Add other specific hostnames if new layers are added
];

// Add version tracking for tile layers
const TILE_VERSIONS = {
  'openstreetmap': 'v1',
  'thunderforest': 'v1',
  'arcgis': 'v1'
};

// Install event - cache app shell
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Take over as the active service worker immediately
  
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL_RESOURCES)
        .catch(error => {
          console.error('Failed to cache app shell resources:', error);
          // Continue even if some resources fail to cache
        });
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const currentCaches = [
    APP_SHELL_CACHE,
    API_CACHE,
    MAP_TILES_CACHE,
    MODEL_CACHE
  ];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!currentCaches.includes(cacheName)) {
            console.log('Deleting outdated cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - handle all requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Handle map tiles
  if (isMapTileRequest(event.request)) {
    event.respondWith(handleMapTileRequest(event.request));
    return;
  }
  
  // Handle API requests
  if (isApiRequest(event.request)) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  
  // Handle app shell requests
  if (isAppShellRequest(event.request)) {
    event.respondWith(handleAppShellRequest(event.request));
    return;
  }
  
  // Handle TensorFlow.js model files
  if (isModelRequest(event.request)) {
    event.respondWith(handleModelRequest(event.request));
    return;
  }
  
  // Handle navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }
  
  // Default fetch strategy for other assets
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetchWithNetworkFallback(event.request);
    })
  );
});

// Helper to determine if request is for a map tile
function isMapTileRequest(request) {
  const url = new URL(request.url);
  return TILE_PROVIDERS.some(provider => url.hostname.includes(provider));
}

// Helper to determine if request is for an API endpoint
function isApiRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/') || 
         url.pathname.includes('/geocode') || 
         url.pathname.includes('/nearby');
}

// Helper to determine if request is for an app shell resource
function isAppShellRequest(request) {
  const url = new URL(request.url);
  return APP_SHELL_RESOURCES.some(resource => {
    if (resource.includes('*')) {
      // Handle wildcard patterns like '/static/js/main.*.js'
      const pattern = resource.replace('*', '.*');
      const regex = new RegExp(pattern);
      return regex.test(url.pathname);
    }
    return url.pathname === resource;
  });
}

// Helper to determine if request is for a model file
function isModelRequest(request) {
  const url = new URL(request.url);
  return url.pathname.includes('/models/') || 
         request.url.includes('tfjs-models');
}

// Handle map tile requests - cache-first, update in background
async function handleMapTileRequest(request) {
  const url = new URL(request.url);
  
  // Extract provider from URL
  const provider = getTileProvider(url);
  if (!provider) return fetch(request);
  
  // Create versioned cache key
  const cacheKey = `${url.toString()}#${TILE_VERSIONS[provider] || 'v1'}`;
  
  // Check cache with versioned key
  const cache = await caches.open(MAP_TILES_CACHE);
  const cachedResponse = await cache.match(cacheKey);
  
  if (cachedResponse) return cachedResponse;
  
  // If not in cache, fetch from network
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
    // If fetch fails, return transparent tile
    return createEmptyTile();
  } catch (error) {
    console.error('Error fetching tile:', error);
    return createEmptyTile();
  }
}

// Create an empty/transparent tile as fallback
function createEmptyTile() {
  // Create a 256x256 transparent PNG in base64
  const TRANSPARENT_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAAD2e2DtAAAAPElEQVR42u3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8GY0AAABXwZLAAAAAElFTkSuQmCC';
  
  const headers = new Headers({
    'Content-Type': 'image/png',
    'Cache-Control': 'no-store'
  });
  
  return fetch(TRANSPARENT_TILE);
}

// Handle API requests - network-first, fall back to cache
async function handleApiRequest(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(API_CACHE);
    
    // Cache successful responses
    if (response.ok) {
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // If offline, try to serve from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If no cached response, return offline API response
    return new Response(
      JSON.stringify({ 
        error: 'You are currently offline',
        isOffline: true,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle app shell requests - cache-first strategy
async function handleAppShellRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  return fetchWithNetworkFallback(request);
}

// Handle model requests - cache-only if already cached, otherwise network
async function handleModelRequest(request) {
  try {
    // Check if model is in cache first
    const cache = await caches.open(MODEL_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If not in model cache, fetch and cache it
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // For model requests that fail when offline, we should return 
    // a specific error that the app can handle
    return new Response(
      JSON.stringify({ 
        error: 'Model not available offline',
        modelRequest: true,
        url: request.url
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle navigation requests
async function handleNavigationRequest(request) {
  try {
    // Try network first for navigation
    const response = await fetch(request);
    
    // Cache the latest version
    const cache = await caches.open(APP_SHELL_CACHE);
    cache.put(request, response.clone());
    
    return response;
  } catch (error) {
    // If offline, try to serve from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If not in cache, serve offline page
    return caches.match('/offline.html');
  }
}

// Fetch with network fallback
async function fetchWithNetworkFallback(request) {
  try {
    const response = await fetch(request);
    
    // Cache successful responses for non-API requests
    if (response.ok && !isApiRequest(request)) {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.warn('Fetch failed, serving from cache if possible:', request.url);
    
    // Try to serve from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If not in cache, return appropriate fallback based on request type
    const url = new URL(request.url);
    
    if (request.destination === 'image') {
      return caches.match('/logo192.png');
    }
    
    if (request.destination === 'document') {
      return caches.match('/offline.html');
    }
    
    // For other asset types, return empty response with appropriate content type
    return new Response('', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Periodic cache refresh check
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-saved-searches') {
    event.waitUntil(syncSavedSearches());
  } else if (event.tag === 'sync-offline-markers') {
    event.waitUntil(syncOfflineMarkers());
  } else if (event.tag === 'refresh-offline-data') {
    event.waitUntil(refreshOfflineData());
  }
});

// Sync saved searches from offline database
async function syncSavedSearches() {
  try {
    const dbName = 'aakash-vaani-offline';
    const storeName = 'saved-searches';
    
    // Open database with enhanced openDB function
    const db = await openDB(dbName, 1, (db) => {
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('synced', 'synced');
      }
    });

    // Get unsynchronized items from object store
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const unsyncedItems = await store.index('synced').getAll(0); // Get items where synced = 0 or false

    console.log(`Found ${unsyncedItems.length} searches to sync`);

    // Process each item
    for (const item of unsyncedItems) {
      try {
        // Send to backend
        const response = await fetch('/api/sync/searches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(item)
        });

        if (response.ok) {
          // Update sync status
          const updateTx = db.transaction(storeName, 'readwrite');
          const updateStore = updateTx.objectStore(storeName);
          item.synced = true;
          await updateStore.put(item);
          console.log(`Successfully synced search: ${item.id}`);
        } else {
          console.error(`Failed to sync search ${item.id}: ${response.statusText}`);
        }
      } catch (error) {
        console.error(`Failed to sync search ${item.id}:`, error);
      }
    }

    // Clean up old synced items
    const now = new Date();
    const cutoffDate = new Date(now.setDate(now.getDate() - 7)); // 7 days old

    const cleanupTx = db.transaction(storeName, 'readwrite');
    const cleanupStore = cleanupTx.objectStore(storeName);
    const oldItems = await cleanupStore.index('timestamp').getAll(IDBKeyRange.upperBound(cutoffDate));

    for (const item of oldItems) {
      if (item.synced) {
        await cleanupStore.delete(item.id);
        console.log(`Deleted old search: ${item.id}`);
      }
    }

    await db.close();
    return true;
  } catch (error) {
    console.error('Error during saved searches sync:', error);
    return false;
  }
}

// Sync offline created markers
async function syncOfflineMarkers() {
  try {
    const dbName = 'aakash-vaani-offline';
    const storeName = 'offline-markers';
    
    // Open database
    const db = await openDB(dbName, 1);
    
    // Get unsynchronized markers
    const unsyncedMarkers = await db.getAll(storeName);
    const markersToSync = unsyncedMarkers.filter(marker => !marker.synced);
    
    console.log(`Found ${markersToSync.length} markers to sync`);
    
    // Process each marker
    for (const marker of markersToSync) {
      try {
        // Send to backend
        const response = await fetch('/api/save-marker', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(marker)
        });
        
        if (response.ok) {
          // Update sync status
          marker.synced = true;
          await db.put(storeName, marker);
          console.log(`Successfully synced marker: ${marker.id}`);
        }
      } catch (error) {
        console.error(`Failed to sync marker ${marker.id}:`, error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error during offline markers sync:', error);
    return false;
  }
}

// Add this function to handle periodic refresh
async function refreshOfflineData() {
  try {
    // Check if we're due for a refresh (once per day)
    const lastUpdate = parseInt(await getLastUpdateTime(), 10) || 0;
    const now = Date.now();
    
    if (now - lastUpdate < CACHE_MAX_AGE && lastUpdate !== 0) {
      console.log('Cache is still fresh, no refresh needed');
      return;
    }
    
    console.log('Starting scheduled offline data refresh');
    
    // Fetch fresh offline data
    const response = await fetch('/offline/data', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'ServiceWorkerRequest'
      }
    });
    
    if (!response.ok) throw new Error(`Failed to fetch offline data: ${response.status}`);
    
    const freshData = await response.json();
    const cache = await caches.open(API_CACHE);
    
    // Store fresh data
    await cache.put(
      new Request('/offline/data'),
      new Response(JSON.stringify(freshData), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    
    // Pre-cache map tiles for default locations
    await cacheDefaultMapTiles(freshData.default_locations);
    
    // Update timestamp
    await storeLastUpdateTime(now);
    
    console.log('Offline data refresh completed successfully');
    return true;
  } catch (error) {
    console.error('Error refreshing offline data:', error);
    return false;
  }
}

// Add these helper functions
async function cacheDefaultMapTiles(locations) {
  const minZoom = 11;
  const maxZoom = 16;
  const tileServers = [
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  ];
  
  const cache = await caches.open(MAP_TILES_CACHE);
  
  // For each location, cache tiles around it
  for (const location of locations) {
    const lat = location.lat;
    const lng = location.lng;
    
    // Cache tiles for multiple zoom levels
    for (let z = minZoom; z <= maxZoom; z++) {
      // Calculate tile coordinates
      const tileX = Math.floor((lng + 180) / 360 * Math.pow(2, z));
      const tileY = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
      
      // Cache neighboring tiles (3x3 area)
      for (let x = tileX - 1; x <= tileX + 1; x++) {
        for (let y = tileY - 1; y <= tileY + 1; y++) {
          // For each tile server
          for (const tileTemplate of tileServers) {
            const url = tileTemplate
              .replace('{z}', z)
              .replace('{x}', x)
              .replace('{s}', ['a', 'b', 'c'][Math.floor(Math.random() * 3)])
              .replace('{y}', y);
            
            try {
              const response = await fetch(url);
              if (response.ok) {
                await cache.put(new Request(url), response);
              }
            } catch (e) {
              // Continue with other tiles even if some fail
              console.warn(`Failed to cache tile: ${url}`, e);
            }
          }
        }
      }
    }
  }
}

async function getLastUpdateTime() {
  // Use IndexedDB to store the last update time
  const db = await openDB('aakash-vaani-cache-meta', 1, (db) => {
    if (!db.objectStoreNames.contains('meta')) {
      db.createObjectStore('meta');
    }
  });
  
  return db.get('meta', LAST_CACHE_UPDATE_KEY) || '0';
}

async function storeLastUpdateTime(timestamp) {
  const db = await openDB('aakash-vaani-cache-meta', 1);
  return db.put('meta', timestamp.toString(), LAST_CACHE_UPDATE_KEY);
}

// Enhanced openDB function with schema upgrades
async function openDB(name, version, upgradeCallback) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    
    if (upgradeCallback) {
      request.onupgradeneeded = (event) => {
        upgradeCallback(event.target.result);
      };
    }
    
    request.onsuccess = () => {
      const db = request.result;
      const wrapped = {
        get: (store, key) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(store, 'readonly');
            const objectStore = transaction.objectStore(store);
            const req = objectStore.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        },
        put: (store, value, key) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(store, 'readwrite');
            const objectStore = transaction.objectStore(store);
            const req = key !== undefined ? 
              objectStore.put(value, key) : 
              objectStore.put(value);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        },
        delete: (store, key) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(store, 'readwrite');
            const objectStore = transaction.objectStore(store);
            const req = objectStore.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        },
        close: () => db.close()
      };
      resolve(wrapped);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Helper function to get tile provider from URL
function getTileProvider(url) {
  if (url.hostname.includes('openstreetmap')) {
    return 'openstreetmap';
  }
  if (url.hostname.includes('thunderforest')) {
    return 'thunderforest';
  }
  if (url.hostname.includes('arcgisonline')) {
    return 'arcgis';
  }
  // Add more providers as needed
  return null;
}

// Enhanced openDB helper function
async function openDB(name, version, upgradeCallback) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);

    // Handle database upgrade/initialization
    request.onupgradeneeded = (event) => {
      if (upgradeCallback) {
        upgradeCallback(event.target.result);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const wrappedDB = {
        transaction: (storeName, mode) => db.transaction(storeName, mode),
        close: () => db.close(),
        objectStoreNames: db.objectStoreNames
      };
      resolve(wrappedDB);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Add this function to check if database exists
async function checkDatabaseExists(name) {
  return new Promise((resolve) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const db = request.result;
      db.close();
      resolve(true);
    };
    request.onerror = () => {
      resolve(false);
    };
  });
}