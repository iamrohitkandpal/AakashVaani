// Geocoding Service using Nominatim API

class GeocodingService {
  constructor() {
    this.baseUrl = 'https://nominatim.openstreetmap.org';
    this.userAgent = 'AakashVaaniApp/1.0';
    this.searchCache = new Map();
    this.reverseCache = new Map();
  }

  // Format coordinates for cache key
  formatCoords(lat, lng) {
    return `${parseFloat(lat).toFixed(6)},${parseFloat(lng).toFixed(6)}`;
  }
  
  // Forward geocoding - search for a place
  async search(query, limit = 5) {
    // Return from cache if available
    const cacheKey = query.toLowerCase().trim();
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey);
    }
    
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        limit: limit,
        addressdetails: 1,
        'accept-language': 'en'
      });
      
      const url = `${this.baseUrl}/search?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });
      
      if (!response.ok) {
        throw new Error(`Geocoding error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Parse the response into a simplified format
      const results = data.map(result => ({
        id: result.place_id,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
        type: result.type,
        importance: result.importance,
        address: result.address,
        boundingBox: result.boundingbox?.map(parseFloat)
      }));
      
      // Cache the results
      this.searchCache.set(cacheKey, results);
      
      return results;
    } catch (error) {
      console.error('Geocoding search error:', error);
      return [];
    }
  }
  
  // Reverse geocoding - get place from coordinates
  async reverseGeocode(lat, lng) {
    // Return from cache if available
    const cacheKey = this.formatCoords(lat, lng);
    if (this.reverseCache.has(cacheKey)) {
      return this.reverseCache.get(cacheKey);
    }
    
    try {
      const params = new URLSearchParams({
        lat: lat,
        lon: lng,
        format: 'json',
        addressdetails: 1,
        zoom: 18,
        'accept-language': 'en'
      });
      
      const url = `${this.baseUrl}/reverse?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });
      
      if (!response.ok) {
        throw new Error(`Reverse geocoding error: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Parse the response into a simplified format
      const formattedResult = {
        id: result.place_id,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
        type: result.type,
        address: result.address,
      };
      
      // Cache the result
      this.reverseCache.set(cacheKey, formattedResult);
      
      return formattedResult;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  }
  
  // Smart search with better handling of ambiguous queries
  async smartSearch(query, limit = 5) {
    // Check if query looks like coordinates
    const coordsRegex = /^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/;
    const coordsMatch = query.match(coordsRegex);
    
    if (coordsMatch) {
      const lat = parseFloat(coordsMatch[1]);
      const lng = parseFloat(coordsMatch[2]);
      
      // Validate lat/lng
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        const result = await this.reverseGeocode(lat, lng);
        
        if (result) {
          return [result];
        }
      }
    }
    
    // Handle special query modifiers
    let processedQuery = query;
    let viewbox = null;
    
    // Check for "near [place]" pattern
    const nearPattern = /near\s+(.+)$/i;
    const nearMatch = query.match(nearPattern);
    
    if (nearMatch) {
      // First, geocode the reference location
      const referencePlace = nearMatch[1];
      const referencePlaceResults = await this.search(referencePlace, 1);
      
      if (referencePlaceResults.length > 0) {
        const refLocation = referencePlaceResults[0];
        // Create a viewbox around the reference location (roughly 10km square)
        const delta = 0.1; // ~10km
        viewbox = [
          refLocation.lng - delta, 
          refLocation.lat - delta, 
          refLocation.lng + delta, 
          refLocation.lat + delta
        ].join(',');
        
        // Remove the "near [place]" part for the main search
        processedQuery = query.replace(nearPattern, '').trim();
      }
    }
    
    // Perform the main search
    try {
      const params = new URLSearchParams({
        q: processedQuery,
        format: 'json',
        limit: limit,
        addressdetails: 1,
        'accept-language': 'en'
      });
      
      // Add viewbox if we have one
      if (viewbox) {
        params.append('viewbox', viewbox);
        params.append('bounded', '1');
      }
      
      const url = `${this.baseUrl}/search?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });
      
      if (!response.ok) {
        throw new Error(`Geocoding error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Parse the response into a simplified format
      const results = data.map(result => ({
        id: result.place_id,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
        type: result.type,
        importance: result.importance,
        address: result.address,
        boundingBox: result.boundingbox?.map(parseFloat)
      }));
      
      return results;
    } catch (error) {
      console.error('Smart search error:', error);
      return [];
    }
  }
  
  // Clear caches
  clearCaches() {
    this.searchCache.clear();
    this.reverseCache.clear();
  }
}

export const geocodingService = new GeocodingService();