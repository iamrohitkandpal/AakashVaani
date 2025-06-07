const CACHE_NAME = 'aakash-vaani-v2';
const APP_SHELL_CACHE = 'app-shell-v2';
const API_CACHE = 'api-data-v2';
const MAP_TILES_CACHE = 'map-tiles-v2';
const MODEL_CACHE = 'tf-models-v2';

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
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'tile.thunderforest.com',
  'server.arcgisonline.com',
  // Add other tile servers you use
];

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
  const cache = await caches.open(MAP_TILES_CACHE);
  
  // Try from cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // Update cache in background if online
    if (navigator.onLine) {
      fetch(request)
        .then(response => {
          if (response.ok) {
            cache.put(request, response);
          }
        })
        .catch(() => {/* Ignore background fetch errors */});
    }
    return cachedResponse;
  }
  
  // If not in cache, fetch from network and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // If offline and not cached, return transparent tile
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

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-saved-searches') {
    event.waitUntil(syncSavedSearches());
  } else if (event.tag === 'sync-offline-markers') {
    event.waitUntil(syncOfflineMarkers());
  }
});

// Sync saved searches from offline database
async function syncSavedSearches() {
  try {
    const dbName = 'aakash-vaani-offline';
    const storeName = 'saved-searches';
    
    // Open database
    const db = await openDB(dbName, 1);
    
    // Get unsynchronized items
    const unsyncedItems = await db.getAll(storeName);
    const itemsToSync = unsyncedItems.filter(item => !item.synced);
    
    console.log(`Found ${itemsToSync.length} searches to sync`);
    
    // Process each item
    for (const item of itemsToSync) {
      try {
        // Send to backend
        const response = await fetch('/api/save-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(item)
        });
        
        if (response.ok) {
          // Update sync status
          item.synced = true;
          await db.put(storeName, item);
          console.log(`Successfully synced search: ${item.id}`);
        }
      } catch (error) {
        console.error(`Failed to sync search ${item.id}:`, error);
      }
    }
    
    // Clean up old synced items
    const now = new Date();
    const cutoffDate = new Date(now.setDate(now.getDate() - 7));
    
    const syncedItems = unsyncedItems.filter(item => item.synced);
    for (const item of syncedItems) {
      const itemDate = new Date(item.timestamp);
      if (itemDate < cutoffDate) {
        await db.delete(storeName, item.id);
        console.log(`Deleted old search: ${item.id}`);
      }
    }
    
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

// Helper function to open IndexedDB
async function openDB(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create stores if they don't exist
      if (!db.objectStoreNames.contains('saved-searches')) {
        db.createObjectStore('saved-searches', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('offline-markers')) {
        db.createObjectStore('offline-markers', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('map-areas')) {
        const mapAreasStore = db.createObjectStore('map-areas', { keyPath: 'id' });
        mapAreasStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    
    request.onsuccess = () => {
      const db = request.result;
      
      resolve({
        get: (storeName, key) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const getRequest = store.get(key);
            
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
          });
        },
        getAll: (storeName) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const getAllRequest = store.getAll();
            
            getAllRequest.onsuccess = () => resolve(getAllRequest.result);
            getAllRequest.onerror = () => reject(getAllRequest.error);
          });
        },
        put: (storeName, value) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const putRequest = store.put(value);
            
            putRequest.onsuccess = () => resolve(putRequest.result);
            putRequest.onerror = () => reject(putRequest.error);
          });
        },
        delete: (storeName, key) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const deleteRequest = store.delete(key);
            
            deleteRequest.onsuccess = () => resolve(deleteRequest.result);
            deleteRequest.onerror = () => reject(deleteRequest.error);
          });
        },
        clear: (storeName) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const clearRequest = store.clear();
            
            clearRequest.onsuccess = () => resolve(clearRequest.result);
            clearRequest.onerror = () => reject(clearRequest.error);
          });
        }
      });
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}