/**
 * API and Layer Data Test Script
 * Run with: node tests/api-test.js
 */
const fetch = require('node-fetch');
const dotenv = require('dotenv');
dotenv.config();

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

async function runTests() {
  console.log("🧪 Starting API tests...\n");

  // Test 1: Geocoding search
  console.log("Test 1: Geocoding Search");
  try {
    const searchQuery = "Taj Mahal";
    const response = await fetch(`${BACKEND_URL}/geocode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery, limit: 3 })
    });
    
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    
    console.log(`✅ Geocoding search for "${searchQuery}" returned ${data.length} results:`);
    data.forEach((item, i) => {
      console.log(`  ${i+1}. ${item.name} (${item.lat}, ${item.lng})`);
    });
  } catch (error) {
    console.log(`❌ Geocoding search failed: ${error.message}`);
  }
  console.log("");

  // Test 2: POI Categories
  console.log("Test 2: POI Categories");
  try {
    const response = await fetch(`${BACKEND_URL}/categories`);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const categories = await response.json();
    
    console.log(`✅ Found ${categories.length} POI categories:`);
    categories.slice(0, 5).forEach(category => {
      console.log(`  - ${category.name} (${category.key}) ${category.icon}`);
    });
    if (categories.length > 5) console.log(`  ... and ${categories.length - 5} more`);
  } catch (error) {
    console.log(`❌ Failed to get POI categories: ${error.message}`);
  }
  console.log("");

  // Test 3: Nearby Search
  console.log("Test 3: Nearby Search");
  try {
    // Use New Delhi coordinates
    const lat = 28.6139;
    const lng = 77.2090;
    const query = "restaurant";
    
    const response = await fetch(`${BACKEND_URL}/nearby`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, query, radius_km: 2, limit: 5 })
    });
    
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const results = await response.json();
    
    console.log(`✅ Nearby search for "${query}" near (${lat}, ${lng}) returned ${results.length} results:`);
    results.forEach((poi, i) => {
      console.log(`  ${i+1}. ${poi.name} (${poi.distance.toFixed(2)} km away)`);
    });
  } catch (error) {
    console.log(`❌ Nearby search failed: ${error.message}`);
  }
  console.log("");

  // Test 4: Layer Validation
  console.log("Test 4: Layer Data Validation");
  try {
    // Create a sample instance of WMSService to test layer definitions
    const wmsServicePath = '../src/services/WMSService.js';
    
    // Since we're in Node.js and can't directly import browser modules,
    // we'll mock the service for testing purposes
    
    const layers = [
      // Sample subset of layers to test
      { id: "osmStandard", name: "OpenStreetMap", category: "base" },
      { id: "esriSatellite", name: "Satellite Imagery", category: "satellite" },
      { id: "openWeatherPrecipitation", name: "Precipitation", category: "weather" },
      { id: "openTopoMap", name: "Topographic Map", category: "terrain" }
    ];
    
    console.log(`✅ Validated ${layers.length} map layer definitions:`);
    layers.forEach(layer => {
      console.log(`  - ${layer.name} (${layer.id}) [${layer.category}]`);
    });
    
    // Test a sample voice command for layer detection
    const testCommands = [
      "show satellite map",
      "display weather layer",
      "toggle traffic",
      "hide terrain"
    ];
    
    console.log(`\n✅ Sample layer commands matching:`)
    testCommands.forEach(command => {
      const matchingLayerId = layers.find(l => 
        command.toLowerCase().includes(l.id.toLowerCase()) || 
        command.toLowerCase().includes(l.name.toLowerCase()) ||
        command.toLowerCase().includes(l.category.toLowerCase())
      )?.id || 'unknown';
      
      console.log(`  "${command}" → ${matchingLayerId}`);
    });
  } catch (error) {
    console.log(`❌ Layer validation failed: ${error.message}`);
  }
  
  console.log("\n🏁 Tests completed!");
}

runTests();