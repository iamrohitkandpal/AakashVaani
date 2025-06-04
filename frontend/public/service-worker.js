const CACHE_NAME = 'aakash-vaani-v1';

// URLs to cache
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/static/js/main.js',
  '/static/css/main.css',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png'
];

// Install event - cache initial assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
      .catch((error) => {
        console.error('Error during service worker installation:', error);
      })
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event strategy - Cache first, then network with cache update
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip cross-origin requests
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    // For API requests that are cross-origin, use network-first approach
    if (event.request.url.includes('/api/')) {
      handleApiRequest(event);
      return;
    }
    return;
  }
  
  // For navigations (HTML pages), use network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            // Clone the response for caching
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // If navigation fails, serve offline page
          return caches.match('/offline.html');
        })
    );
    return;
  }
  
  // For static assets, use cache-first
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          // Refresh cache in the background
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkResponse);
                });
              }
            })
            .catch(() => {
              // Silently fail on background update
            });
          
          return response;
        }
        
        // Not in cache - fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Cache the network response for future
            if (networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            
            return networkResponse;
          })
          .catch((error) => {
            console.error('Fetch failed:', error);
            
            // For image requests, return placeholder
            if (event.request.destination === 'image') {
              return caches.match('/logo192.png');
            }
            
            // For JS/CSS, return empty response
            if (event.request.destination === 'script' || 
                event.request.destination === 'style') {
              return new Response('', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            }
            
            // For other requests, respond with offline page
            return caches.match('/offline.html');
          });
      })
  );
});

// Handle API requests differently (network first, fallback to cached)
function handleApiRequest(event) {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Fall back to cache if network fails
        return caches.match(event.request);
      })
  );
}

// Background sync for offline interactions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-saved-searches') {
    event.waitUntil(syncSavedSearches());
  }
});

// Handle background sync
async function syncSavedSearches() {
  try {
    const dbName = 'aakash-vaani-offline';
    const storeName = 'saved-searches';
    
    // Open database
    const db = await openDB(dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
    });
    
    // Get pending searches
    const searches = await db.getAll(storeName);
    
    // Process each search
    for (const search of searches) {
      if (search.synced) continue;
      
      try {
        // Send to server
        const response = await fetch('/api/save-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(search)
        });
        
        if (response.ok) {
          // Mark as synced
          search.synced = true;
          await db.put(storeName, search);
        }
      } catch (error) {
        console.error('Error syncing search:', error);
      }
    }
    
    // Clean up synced items older than 7 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    
    const syncedSearches = searches.filter(s => s.synced);
    for (const search of syncedSearches) {
      const searchDate = new Date(search.timestamp);
      if (searchDate < cutoffDate) {
        await db.delete(storeName, search.id);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error during background sync:', error);
    return false;
  }
}

// Helper function to open IndexedDB
async function openDB(name, version, config) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    
    if (config && config.upgrade) {
      request.onupgradeneeded = (event) => {
        config.upgrade(event.target.result);
      };
    }
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  const title = data.title || 'Aakash Vaani';
  const options = {
    body: data.body || 'New notification from Aakash Vaani',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data.url;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If no window exists, open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});