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
      const response = await fetch(this.overpassUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`
      });

      if (!response.ok) {
        throw new Error(`POI request failed: ${response.status}`);
      }

      const data = await response.json();
      const pois = this.processOverpassData(data, categoryConfig);
      
      // Cache the result
      this.cache.set(cacheKey, pois);
      
      // Clean cache if it gets too large
      if (this.cache.size > 50) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return pois;
    } catch (error) {
      console.error('POI search error:', error);
      return [];
    }
  }

  processOverpassData(data, categoryConfig) {
    if (!data.elements) return [];

    return data.elements.map(element => {
      // Get coordinates (handle nodes, ways, and relations)
      let lat, lng;
      if (element.type === 'node') {
        lat = element.lat;
        lng = element.lon;
      } else if (element.center) {
        lat = element.center.lat;
        lng = element.center.lon;
      } else if (element.lat && element.lon) {
        lat = element.lat;
        lng = element.lon;
      }

      if (!lat || !lng) return null;

      const tags = element.tags || {};
      
      return {
        id: element.id,
        type: element.type,
        lat,
        lng,
        name: tags.name || tags.brand || 'Unnamed Location',
        category: categoryConfig.name,
        icon: categoryConfig.icon,
        amenity: tags.amenity,
        cuisine: tags.cuisine,
        phone: tags.phone,
        website: tags.website,
        openingHours: tags.opening_hours,
        address: this.buildAddress(tags),
        rating: tags['stars'] || null,
        wheelchair: tags.wheelchair,
        tags: tags,
        distance: null // Will be calculated when displaying
      };
    }).filter(poi => poi !== null);
  }

  buildAddress(tags) {
    const parts = [];
    
    if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
    if (tags['addr:street']) parts.push(tags['addr:street']);
    if (tags['addr:city']) parts.push(tags['addr:city']);
    if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
    
    return parts.length > 0 ? parts.join(', ') : null;
  }

  // Calculate distance between two points
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
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
    const normalized = query.toLowerCase();
    
    // Direct matches
    for (const [key, config] of Object.entries(this.categories)) {
      if (normalized.includes(key) || normalized.includes(config.name.toLowerCase())) {
        return key;
      }
    }

    // Keyword matches
    if (normalized.includes('eat') || normalized.includes('food') || normalized.includes('restaurant')) return 'food';
    if (normalized.includes('medical') || normalized.includes('doctor') || normalized.includes('health')) return 'hospital';
    if (normalized.includes('money') || normalized.includes('cash') || normalized.includes('atm')) return 'bank';
    if (normalized.includes('fuel') || normalized.includes('petrol') || normalized.includes('gasoline')) return 'gas';
    if (normalized.includes('learn') || normalized.includes('education')) return 'school';
    if (normalized.includes('stay') || normalized.includes('accommodation')) return 'hotel';
    if (normalized.includes('buy') || normalized.includes('store') || normalized.includes('market')) return 'shopping';
    if (normalized.includes('nature') || normalized.includes('green') || normalized.includes('outdoor')) return 'park';
    if (normalized.includes('exercise') || normalized.includes('workout') || normalized.includes('fitness')) return 'gym';
    if (normalized.includes('emergency') || normalized.includes('help')) return 'police';
    if (normalized.includes('mail') || normalized.includes('package')) return 'post';
    if (normalized.includes('bus') || normalized.includes('train') || normalized.includes('transport')) return 'transit';
    
    // Default fallback
    return 'restaurant';
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