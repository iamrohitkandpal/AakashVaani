// Geocoding Service using Nominatim API

class GeocodingService {
  constructor() {
    // Configure API endpoints
    this.searchEndpoint = 'https://nominatim.openstreetmap.org/search';
    this.reverseEndpoint = 'https://nominatim.openstreetmap.org/reverse';
    
    // Backend proxy endpoints (for production)
    this.backendURL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
    this.backendSearchEndpoint = `${this.backendURL}/geocode`;
    this.backendReverseEndpoint = `${this.backendURL}/reverse-geocode`;
    
    // Use backend by default to respect API usage policies
    this.useBackend = true;
    
    // Cache settings
    this.cache = new Map();
    this.cacheSize = 100;
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
    
    // Request settings
    this.defaultParams = {
      format: 'json',
      addressdetails: 1,
      limit: 10
    };
    
    // Add a user agent for OSM's Nominatim Usage Policy
    this.headers = {
      'User-Agent': 'AakashVaani/1.0'
    };
  }

  // Format coordinates for cache key
  formatCoords(lat, lng) {
    return `${parseFloat(lat).toFixed(5)},${parseFloat(lng).toFixed(5)}`;
  }

  // Get from cache
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  // Add to cache
  addToCache(key, data) {
    // Limit cache size with LRU approach
    if (this.cache.size >= this.cacheSize) {
      // Delete oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Search for places by name
  async search(query, options = {}) {
    if (!query) return [];
    
    // Check cache first
    const cacheKey = `search:${query}:${JSON.stringify(options)}`;
    const cachedResults = this.getFromCache(cacheKey);
    if (cachedResults) return cachedResults;
    
    try {
      let results;
      
      if (this.useBackend) {
        // Use backend proxy to respect API usage policies
        const response = await fetch(this.backendSearchEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query,
            limit: options.limit || this.defaultParams.limit,
            country_code: options.countryCode
          })
        });
        
        if (!response.ok) {
          throw new Error(`Backend geocoding error: ${response.status}`);
        }
        
        results = await response.json();
      } else {
        // Direct API call (not recommended for production)
        const params = new URLSearchParams({
          ...this.defaultParams,
          q: query,
          limit: options.limit || this.defaultParams.limit
        });
        
        if (options.countryCode) {
          params.append('countrycodes', options.countryCode);
        }
        
        const response = await fetch(`${this.searchEndpoint}?${params}`, {
          headers: this.headers
        });
        
        if (!response.ok) {
          throw new Error(`Geocoding API error: ${response.status}`);
        }
        
        results = await response.json();
      }
      
      // Format results
      const formattedResults = results.map(item => ({
        id: item.place_id || item.osm_id,
        name: item.name || item.display_name,
        type: item.type || 'place',
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        address: item.address || {},
        raw: item
      }));
      
      // Cache results
      this.addToCache(cacheKey, formattedResults);
      
      return formattedResults;
    } catch (error) {
      console.error('Error during geocoding search:', error);
      return [];
    }
  }

  // Get details for coordinates
  async reverseGeocode(lat, lng, options = {}) {
    if (!lat || !lng) return null;
    
    // Check cache first
    const cacheKey = `reverse:${this.formatCoords(lat, lng)}:${options.zoom || 18}`;
    const cachedResult = this.getFromCache(cacheKey);
    if (cachedResult) return cachedResult;
    
    try {
      let result;
      
      if (this.useBackend) {
        // Use backend proxy
        const response = await fetch(this.backendReverseEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            zoom: options.zoom || 18
          })
        });
        
        if (!response.ok) {
          throw new Error(`Backend reverse geocoding error: ${response.status}`);
        }
        
        result = await response.json();
      } else {
        // Direct API call (not recommended for production)
        const params = new URLSearchParams({
          ...this.defaultParams,
          lat: lat,
          lon: lng,
          zoom: options.zoom || 18,
          addressdetails: 1
        });
        
        const response = await fetch(`${this.reverseEndpoint}?${params}`, {
          headers: this.headers
        });
        
        if (!response.ok) {
          throw new Error(`Reverse geocoding API error: ${response.status}`);
        }
        
        result = await response.json();
      }
      
      // Format result
      const formattedResult = {
        id: result.place_id || result.osm_id,
        name: result.name || result.display_name,
        type: result.type || 'place',
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        address: result.address || {},
        raw: result
      };
      
      // Cache result
      this.addToCache(cacheKey, formattedResult);
      
      return formattedResult;
    } catch (error) {
      console.error('Error during reverse geocoding:', error);
      return null;
    }
  }

  // Smart search combining geocoding and nearby POI search
  async smartSearch(query, options = {}) {
    if (!query) return [];
    
    try {
      // First try regular geocoding
      const geocodeResults = await this.search(query, options);
      
      // If we have results, return them
      if (geocodeResults && geocodeResults.length > 0) {
        return geocodeResults;
      }
      
      // If no results and we have current location, try nearby search
      if (options.lat && options.lng) {
        const nearbyParams = {
          lat: options.lat,
          lng: options.lng,
          query: query,
          radius_km: options.radius || 2
        };
        
        const response = await fetch(`${this.backendURL}/nearby`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(nearbyParams)
        });
        
        if (!response.ok) {
          throw new Error(`Backend nearby search error: ${response.status}`);
        }
        
        const nearbyResults = await response.json();
        
        // Format nearby results
        if (nearbyResults && nearbyResults.results) {
          return nearbyResults.results.map(item => ({
            id: item.id,
            name: item.name,
            type: item.type,
            lat: item.lat,
            lng: item.lng,
            address: item.address || {},
            distance: item.distance,
            raw: item
          }));
        }
      }
      
      return [];
    } catch (error) {
      console.error('Error during smart search:', error);
      return [];
    }
  }
}

// Create and export singleton instance
export const geocodingService = new GeocodingService();
export default GeocodingService;