// Geocoding Service using Nominatim API
class GeocodingService {
  constructor() {
    this.baseUrl = 'https://nominatim.openstreetmap.org';
    this.cache = new Map();
    this.rateLimitDelay = 1000; // 1 second between requests
    this.lastRequestTime = 0;
  }

  async search(query, options = {}) {
    try {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.rateLimitDelay) {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
      }

      // Check cache first
      const cacheKey = `${query}_${JSON.stringify(options)}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const params = new URLSearchParams({
        q: query,
        format: 'json',
        addressdetails: '1',
        limit: options.limit || '5',
        ...options
      });

      this.lastRequestTime = Date.now();
      const response = await fetch(`${this.baseUrl}/search?${params}`, {
        headers: {
          'User-Agent': 'GeoVoiceNavigator/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Geocoding request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Cache the result
      this.cache.set(cacheKey, data);
      
      // Clean cache if it gets too large
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return data;
    } catch (error) {
      console.error('Geocoding error:', error);
      throw error;
    }
  }

  async reverseGeocode(lat, lon) {
    try {
      const cacheKey = `reverse_${lat}_${lon}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.rateLimitDelay) {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
      }

      const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lon.toString(),
        format: 'json',
        addressdetails: '1'
      });

      this.lastRequestTime = Date.now();
      const response = await fetch(`${this.baseUrl}/reverse?${params}`, {
        headers: {
          'User-Agent': 'GeoVoiceNavigator/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Reverse geocoding request failed: ${response.status}`);
      }

      const data = await response.json();
      this.cache.set(cacheKey, data);

      return data;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      throw error;
    }
  }

  // Enhanced search with location type detection
  async smartSearch(query) {
    const results = await this.search(query);
    
    return results.map(result => ({
      id: result.place_id,
      displayName: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      type: this.classifyLocationType(result),
      importance: parseFloat(result.importance || 0),
      category: result.category,
      boundingBox: result.boundingbox ? {
        north: parseFloat(result.boundingbox[1]),
        south: parseFloat(result.boundingbox[0]),
        east: parseFloat(result.boundingbox[3]),
        west: parseFloat(result.boundingbox[2])
      } : null,
      address: this.parseAddress(result.address)
    }));
  }

  classifyLocationType(result) {
    const type = result.type || '';
    const category = result.category || '';
    
    if (category === 'place') {
      if (type.includes('city') || type.includes('town') || type.includes('village')) {
        return 'city';
      }
      if (type.includes('country')) return 'country';
      if (type.includes('state') || type.includes('province')) return 'state';
    }
    
    if (category === 'amenity') return 'amenity';
    if (category === 'tourism') return 'tourism';
    if (category === 'shop') return 'shop';
    if (category === 'natural') return 'natural';
    
    return 'place';
  }

  parseAddress(address) {
    if (!address) return null;
    
    return {
      house_number: address.house_number,
      road: address.road,
      suburb: address.suburb,
      city: address.city || address.town || address.village,
      state: address.state,
      country: address.country,
      postcode: address.postcode
    };
  }

  // Get location suggestions for autocomplete
  async getSuggestions(query, maxResults = 5) {
    if (query.length < 3) return [];
    
    try {
      const results = await this.smartSearch(query);
      return results.slice(0, maxResults).map(result => ({
        id: result.id,
        text: result.displayName,
        lat: result.lat,
        lng: result.lng,
        type: result.type
      }));
    } catch (error) {
      console.error('Error getting suggestions:', error);
      return [];
    }
  }
}

// Create and export singleton instance
export const geocodingService = new GeocodingService();
export default GeocodingService;