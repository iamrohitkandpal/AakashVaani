// Points of Interest Service using Overpass API
class POIService {
  constructor() {
    this.overpassEndpoint = 'https://overpass-api.de/api/interpreter';
    this.backendURL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
    this.backendNearbyEndpoint = `${this.backendURL}/nearby`;
    
    // Cache for queries
    this.cache = new Map();
    this.cacheSize = 100;
    this.cacheTTL = 60 * 60 * 1000; // 1 hour in ms
    
    // Map amenity categories
    this.amenityCategories = {
      // Food & Drink
      'restaurant': { icon: '🍽️', category: 'food' },
      'cafe': { icon: '☕', category: 'food' },
      'bar': { icon: '🍷', category: 'food' },
      'pub': { icon: '🍺', category: 'food' },
      'fast_food': { icon: '🍔', category: 'food' },
      'food_court': { icon: '🍴', category: 'food' },
      'bakery': { icon: '🥐', category: 'food' },
      
      // Shopping
      'supermarket': { icon: '🛒', category: 'shopping' },
      'mall': { icon: '🛍️', category: 'shopping' },
      'marketplace': { icon: '🏪', category: 'shopping' },
      'department_store': { icon: '🏬', category: 'shopping' },
      'convenience': { icon: '🏪', category: 'shopping' },
      
      // Health
      'hospital': { icon: '🏥', category: 'health' },
      'clinic': { icon: '🏥', category: 'health' },
      'doctors': { icon: '👨‍⚕️', category: 'health' },
      'dentist': { icon: '🦷', category: 'health' },
      'pharmacy': { icon: '💊', category: 'health' },
      
      // Transportation
      'bus_station': { icon: '🚌', category: 'transport' },
      'bus_stop': { icon: '🚏', category: 'transport' },
      'train_station': { icon: '🚆', category: 'transport' },
      'subway_entrance': { icon: '🚇', category: 'transport' },
      'taxi': { icon: '🚕', category: 'transport' },
      'fuel': { icon: '⛽', category: 'transport' },
      'car_rental': { icon: '🚗', category: 'transport' },
      'bicycle_rental': { icon: '🚲', category: 'transport' },
      
      // Entertainment
      'cinema': { icon: '🎬', category: 'entertainment' },
      'theatre': { icon: '🎭', category: 'entertainment' },
      'arts_centre': { icon: '🎨', category: 'entertainment' },
      'museum': { icon: '🏛️', category: 'entertainment' },
      'nightclub': { icon: '💃', category: 'entertainment' },
      'park': { icon: '🌳', category: 'entertainment' },
      'playground': { icon: '🛝', category: 'entertainment' },
      
      // Services
      'bank': { icon: '🏦', category: 'services' },
      'atm': { icon: '💰', category: 'services' },
      'post_office': { icon: '📮', category: 'services' },
      'police': { icon: '👮', category: 'services' },
      'fire_station': { icon: '🚒', category: 'services' },
      'library': { icon: '📚', category: 'services' },
      'school': { icon: '🏫', category: 'services' },
      'university': { icon: '🎓', category: 'services' },
      'college': { icon: '🎓', category: 'services' },
      'place_of_worship': { icon: '🙏', category: 'services' },
      'hotel': { icon: '🏨', category: 'services' },
      'embassy': { icon: '🏢', category: 'services' },
      'toilets': { icon: '🚻', category: 'services' }
    };
  }
  
  // Utility to convert user query to OSM amenity tag
  convertQueryToAmenity(query) {
    const queryLower = query.toLowerCase().trim();
    
    // Direct mapping for common search terms
    const directMapping = {
      'restaurant': 'restaurant',
      'food': 'restaurant',
      'cafe': 'cafe',
      'coffee': 'cafe',
      'bar': 'bar',
      'pub': 'pub',
      'hospital': 'hospital',
      'doctor': 'doctors',
      'clinic': 'clinic',
      'pharmacy': 'pharmacy',
      'chemist': 'pharmacy',
      'drug store': 'pharmacy',
      'hotel': 'hotel',
      'atm': 'atm',
      'bank': 'bank',
      'police': 'police',
      'gas': 'fuel',
      'gas station': 'fuel',
      'petrol': 'fuel',
      'bus': 'bus_stop',
      'bus stop': 'bus_stop',
      'train': 'train_station',
      'train station': 'train_station',
      'school': 'school',
      'university': 'university',
      'college': 'college',
      'cinema': 'cinema',
      'movie': 'cinema',
      'theatre': 'theatre',
      'theater': 'theatre',
      'supermarket': 'supermarket',
      'grocery': 'supermarket',
      'mall': 'mall',
      'shopping mall': 'mall',
      'post office': 'post_office',
      'park': 'park',
      'garden': 'park',
      'library': 'library',
      'church': 'place_of_worship',
      'temple': 'place_of_worship',
      'mosque': 'place_of_worship',
      'synagogue': 'place_of_worship',
      'toilet': 'toilets',
      'restroom': 'toilets',
      'bathroom': 'toilets'
    };
    
    // First try direct mapping
    if (directMapping[queryLower]) {
      return directMapping[queryLower];
    }
    
    // Then try partial matching
    for (const [key, value] of Object.entries(directMapping)) {
      if (queryLower.includes(key)) {
        return value;
      }
    }
    
    // Default to the original query if no match found
    return queryLower;
  }
  
  // Get cache key for a nearby query
  getCacheKey(lat, lng, query, radius) {
    const latRounded = parseFloat(lat).toFixed(4);
    const lngRounded = parseFloat(lng).toFixed(4);
    const radiusRounded = Math.round(radius * 10) / 10;
    return `nearby:${latRounded},${lngRounded}:${query}:${radiusRounded}`;
  }
  
  // Check cache for results
  getFromCache(key) {
    if (!this.cache.has(key)) return null;
    
    const cachedData = this.cache.get(key);
    const now = Date.now();
    
    // Check if data is expired
    if (now - cachedData.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cachedData.data;
  }
  
  // Add results to cache
  addToCache(key, data) {
    // Maintain cache size
    if (this.cache.size >= this.cacheSize) {
      // Remove oldest entry
      const oldestKey = [...this.cache.keys()][0];
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  // Calculate distance between two coordinates (haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  // Convert degrees to radians
  toRadians(degrees) {
    return degrees * Math.PI / 180;
  }
  
  // Get icon for an amenity
  getIcon(amenity) {
    return this.amenityCategories[amenity]?.icon || '📍';
  }
  
  // Get category for an amenity
  getCategory(amenity) {
    return this.amenityCategories[amenity]?.category || 'other';
  }
  
  // Search for points of interest near a location
  async findNearby(lat, lng, query, options = {}) {
    if (!lat || !lng || !query) {
      console.error('Invalid parameters for nearby search');
      return { results: [] };
    }
    
    const radius = options.radius || 2.0; // Default 2km radius
    const limit = options.limit || 20; // Default 20 results
    
    // Check cache first
    const cacheKey = this.getCacheKey(lat, lng, query, radius);
    const cachedResults = this.getFromCache(cacheKey);
    if (cachedResults) {
      console.log('Using cached results for', query);
      return cachedResults;
    }
    
    try {
      // Use backend proxy to respect API usage policies
      const response = await fetch(this.backendNearbyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          query: query,
          radius_km: radius,
          limit: limit
        })
      });
      
      if (!response.ok) {
        throw new Error(`Backend nearby search error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Enhance the results with additional information
      if (data.results && Array.isArray(data.results)) {
        data.results.forEach(item => {
          // Add icon based on amenity
          const amenity = this.convertQueryToAmenity(query);
          item.icon = this.getIcon(amenity);
          item.category = this.getCategory(amenity);
          
          // Calculate distance if not provided
          if (!item.distance && item.lat && item.lng) {
            item.distance = this.calculateDistance(lat, lng, item.lat, item.lng);
          }
        });
        
        // Sort by distance
        data.results.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
      }
      
      // Cache the results
      this.addToCache(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error('Error searching for nearby POIs:', error);
      return { results: [] };
    }
  }
  
  // Get categories for filtering
  getCategories() {
    // Deduplicate categories
    const uniqueCategories = new Set();
    
    Object.values(this.amenityCategories).forEach(info => {
      if (info.category) {
        uniqueCategories.add(info.category);
      }
    });
    
    // Convert to array and format
    return Array.from(uniqueCategories).map(category => {
      return {
        id: category,
        name: category.charAt(0).toUpperCase() + category.slice(1),
        icon: this.getCategoryIcon(category)
      };
    });
  }
  
  // Get representative icon for a category
  getCategoryIcon(category) {
    const mapping = {
      'food': '🍽️',
      'shopping': '🛍️',
      'health': '🏥',
      'transport': '🚌',
      'entertainment': '🎭',
      'services': '🏢',
      'other': '📍'
    };
    
    return mapping[category] || '📍';
  }
  
  // Check if a location is open now (based on OSM opening_hours tag)
  isOpenNow(openingHours) {
    if (!openingHours) return null; // Unknown status
    
    // This would require a full OpeningHours parser to handle complex formats
    // For now, returning a simplified check
    if (openingHours.includes('24/7')) return true;
    
    // For a basic implementation, we would return null (unknown)
    // A full implementation would use a library like opening_hours.js
    return null;
  }
}

// Create and export singleton instance
export const poiService = new POIService();