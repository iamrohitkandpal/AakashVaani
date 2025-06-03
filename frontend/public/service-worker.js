const CACHE_NAME = 'aakash-vaani-v1';

// URLs to cache
const urlsToCache = [
  '/',
  '/index.html',
  '/static/js/main.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  // Cache map tiles (examples)
  'https://tile.openstreetmap.org/0/0/0.png',
  // Add other commonly used assets here
];

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Cache install error:', error);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Function to determine if a request should be cached
function shouldCache(url) {
  // Cache static assets
  if (url.includes('/static/')) return true;
  
  // Cache map tiles
  if (url.includes('.tile.openstreetmap.org')) return true;
  if (url.includes('stamen-tiles')) return true;
  if (url.includes('cartodb-basemaps')) return true;
  if (url.includes('arcgisonline.com')) return true;
  
  return false;
}

// Fetch event - serve from cache if available, otherwise fetch from network
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (event.request.url.startsWith(self.location.origin) || 
      shouldCache(event.request.url)) {
    
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            // Return cached response
            return response;
          }
          
          // Clone the request because it can only be used once
          const fetchRequest = event.request.clone();
          
          return fetch(fetchRequest)
            .then(response => {
              // Check if response is valid
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // Clone the response because it can only be used once
              const responseToCache = response.clone();
              
              // Only cache specific URLs
              if (shouldCache(event.request.url)) {
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(event.request, responseToCache);
                  });
              }
              
              return response;
            });
        })
        .catch(() => {
          // Network request failed, try to serve the offline page
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
        })
    );
  }
});

// Handle messages from the main thread
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});