// Points of Interest Service using Overpass API
class POIService {
  constructor() {
    this.overpassUrl = 'https://overpass-api.de/api/interpreter';
    this.cache = new Map();
    this.rateLimitDelay = 2000; // 2 seconds between requests
    this.lastRequestTime = 0;
    
    // Define POI categories with Overpass query patterns
    this.categories = {
      'restaurant': {
        name: 'Restaurants',
        icon: '🍽️',
        query: 'amenity=restaurant'
      },
      'food': {
        name: 'Food & Dining',
        icon: '🍔',
        query: '(amenity=restaurant or amenity=fast_food or amenity=cafe or amenity=bar)'
      },
      'hospital': {
        name: 'Hospitals',
        icon: '🏥',
        query: 'amenity=hospital'
      },
      'pharmacy': {
        name: 'Pharmacies',
        icon: '💊',
        query: 'amenity=pharmacy'
      },
      'bank': {
        name: 'Banks & ATMs',
        icon: '🏦',
        query: '(amenity=bank or amenity=atm)'
      },
      'gas': {
        name: 'Gas Stations',
        icon: '⛽',
        query: 'amenity=fuel'
      },
      'school': {
        name: 'Schools',
        icon: '🏫',
        query: 'amenity=school'
      },
      'university': {
        name: 'Universities',
        icon: '🎓',
        query: 'amenity=university'
      },
      'hotel': {
        name: 'Hotels',
        icon: '🏨',
        query: 'tourism=hotel'
      },
      'shopping': {
        name: 'Shopping',
        icon: '🛍️',
        query: '(shop=supermarket or shop=mall or amenity=marketplace)'
      },
      'park': {
        name: 'Parks',
        icon: '🌳',
        query: 'leisure=park'
      },
      'gym': {
        name: 'Gyms & Fitness',
        icon: '💪',
        query: 'leisure=fitness_centre'
      },
      'police': {
        name: 'Police Stations',
        icon: '👮',
        query: 'amenity=police'
      },
      'post': {
        name: 'Post Offices',
        icon: '📮',
        query: 'amenity=post_office'
      },
      'transit': {
        name: 'Public Transit',
        icon: '🚌',
        query: '(public_transport=station or railway=station or amenity=bus_station)'
      }
    };

    this.categoryMap = {
      // Food & Drink
      'restaurant': 'restaurant',
      'restaurants': 'restaurant',
      'food': 'restaurant',
      'dining': 'restaurant',
      'cafe': 'cafe',
      'cafes': 'cafe',
      'coffee': 'cafe',
      'bar': 'bar',
      'bars': 'bar',
      'pub': 'pub',
      'pubs': 'pub',
      
      // Healthcare
      'hospital': 'hospital',
      'hospitals': 'hospital',
      'clinic': 'clinic',
      'clinics': 'clinic',
      'doctor': 'doctors',
      'doctors': 'doctors',
      'pharmacy': 'pharmacy',
      'pharmacies': 'pharmacy',
      'medical': 'hospital',
      'healthcare': 'hospital',
      
      // Transportation
      'gas': 'fuel',
      'gas station': 'fuel',
      'petrol': 'fuel',
      'fuel': 'fuel',
      'bus stop': 'bus_stop',
      'bus station': 'bus_station',
      'train': 'train_station',
      'train station': 'train_station',
      'railway': 'train_station',
      'airport': 'airport',
      'taxi': 'taxi',
      
      // Financial
      'bank': 'bank',
      'banks': 'bank',
      'atm': 'atm',
      'atms': 'atm',
      
      // Shopping
      'supermarket': 'supermarket',
      'supermarkets': 'supermarket',
      'grocery': 'supermarket',
      'groceries': 'supermarket',
      'shop': 'shop',
      'shops': 'shop',
      'shopping': 'mall',
      'mall': 'mall',
      'malls': 'mall',
      
      // Accommodation
      'hotel': 'hotel',
      'hotels': 'hotel',
      'motel': 'hotel',
      'hostel': 'hostel',
      'lodging': 'hotel',
      
      // Entertainment
      'cinema': 'cinema',
      'cinemas': 'cinema',
      'movie': 'cinema',
      'movies': 'cinema',
      'theater': 'theatre',
      'theatre': 'theatre',
      'museum': 'museum',
      'museums': 'museum',
      'gallery': 'art_gallery',
      'park': 'park',
      'parks': 'park',
      
      // Education
      'school': 'school',
      'college': 'college',
      'university': 'university',
      'library': 'library',
      'libraries': 'library',
      
      // Other
      'police': 'police',
      'post office': 'post_office',
      'post': 'post_office',
      'church': 'place_of_worship',
      'temple': 'place_of_worship',
      'mosque': 'place_of_worship',
      'worship': 'place_of_worship',
      'religious': 'place_of_worship'
    };
  }

  async findNearby(lat, lng, category, radiusKm = 2, limit = 20) {
    try {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.rateLimitDelay) {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
      }

      // Check cache
      const cacheKey = `${lat}_${lng}_${category}_${radiusKm}_${limit}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const categoryConfig = this.categories[category] || this.categories['restaurant'];
      const radiusMeters = radiusKm * 1000;

      // Build Overpass QL query
      const query = `
        [out:json][timeout:25];
        (
          node[${categoryConfig.query}](around:${radiusMeters},${lat},${lng});
          way[${categoryConfig.query}](around:${radiusMeters},${lat},${lng});
          relation[${categoryConfig.query}](around:${radiusMeters},${lat},${lng});
        );
        out center meta ${limit};
      `;

      this.lastRequestTime = Date.now();
      
      // Perform the request with error handling
      const response = await fetch(this.overpassUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        throw new Error(`Overpass API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Process the results
      const results = this.processOverpassData(data, categoryConfig);
      
      // Add distance and sort by proximity
      const poisWithDistance = this.addDistanceAndSort(results, lat, lng);
      
      // Cache the result
      this.cache.set(cacheKey, poisWithDistance);
      
      // Clean cache if it gets too big
      if (this.cache.size > 50) {
        // Delete oldest entry
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      
      return poisWithDistance;
    } catch (error) {
      console.error('POI search error:', error);
      
      // In case of error, return empty array
      return [];
    }
  }

  processOverpassData(data, categoryConfig) {
    if (!data.elements) {
      return [];
    }

    return data.elements.map(element => {
      try {
        // Check if it's a way/relation with a center point
        const lat = element.center ? element.center.lat : element.lat;
        const lng = element.center ? element.center.lon : element.lon;
        
        if (!lat || !lng) {
          return null;
        }
        
        // Get the name from tags
        const name = element.tags?.name || 
                    (element.tags?.brand || element.tags?.operator) || 
                    `${categoryConfig.name} #${element.id.toString().substring(0, 4)}`;
        
        return {
          id: element.id.toString(),
          name: name,
          lat: lat,
          lng: lng,
          category: categoryConfig.name,
          icon: categoryConfig.icon,
          address: this.buildAddress(element.tags),
          phone: element.tags?.phone || element.tags?.['contact:phone'],
          website: element.tags?.website || element.tags?.url,
          openingHours: element.tags?.opening_hours
        };
      } catch (e) {
        console.error('Error processing POI element:', e);
        return null;
      }
    }).filter(poi => poi !== null);
  }

  buildAddress(tags) {
    const parts = [];
    
    if (tags['addr:housenumber']) {
      parts.push(tags['addr:housenumber']);
    }
    
    if (tags['addr:street']) {
      parts.push(tags['addr:street']);
    }
    
    if (tags['addr:city']) {
      parts.push(tags['addr:city']);
    }
    
    if (tags['addr:postcode']) {
      parts.push(tags['addr:postcode']);
    }
    
    return parts.length > 0 ? parts.join(', ') : null;
  }

  // Calculate distance between two points
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  // Add distance to POIs and sort by distance
  addDistanceAndSort(pois, centerLat, centerLng) {
    return pois.map(poi => ({
      ...poi,
      distance: this.calculateDistance(centerLat, centerLng, poi.lat, poi.lng)
    })).sort((a, b) => a.distance - b.distance);
  }

  // Smart category detection from voice commands
  detectCategory(query) {
    if (!query || typeof query !== 'string') return null;
    
    const normalizedQuery = query.toLowerCase();
    
    // Try direct match first
    for (const [keyword, category] of Object.entries(this.categoryMap)) {
      if (normalizedQuery.includes(keyword)) {
        return category;
      }
    }
    
    // If no direct match, make an educated guess using word similarity
    const words = normalizedQuery.split(/\s+/);
    for (const word of words) {
      if (word.length > 3) { // Only consider words longer than 3 characters
        for (const [keyword, category] of Object.entries(this.categoryMap)) {
          // Simple prefix matching
          if (keyword.startsWith(word) || word.startsWith(keyword)) {
            return category;
          }
        }
      }
    }
    
    // Default to a reasonable category if no match
    if (normalizedQuery.includes('find') || normalizedQuery.includes('search')) {
      return 'restaurant'; // Most commonly searched POI
    }
    
    return null;
  }

  getAvailableCategories() {
    return Object.entries(this.categories).map(([key, config]) => ({
      id: key,
      name: config.name,
      icon: config.icon
    }));
  }
}

// Create and export singleton instance
export const poiService = new POIService();
export default POIService;