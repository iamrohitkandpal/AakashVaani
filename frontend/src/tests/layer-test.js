async function testLayers() {
  console.log('🧪 Testing Layer Management...');
  
  const wmsService = new WMSService();
  const layers = wmsService.getAllLayers();
  
  // Test layer definitions
  console.log(`Found ${layers.length} layers`);
  layers.forEach(layer => {
    console.log(`Testing layer: ${layer.id}`);
    // Verify required properties
    if (!layer.url || !layer.name || !layer.category) {
      console.log(`❌ Missing required properties for layer ${layer.id}`);
    }
  });
  
  // Test tile loading
  const testLayer = layers[0];
  try {
    const response = await fetch(testLayer.url
      .replace('{z}', '10')
      .replace('{x}', '512')
      .replace('{y}', '512')
      .replace('{s}', 'a'));
    
    if (response.ok) {
      console.log('✅ Test tile loaded successfully');
    } else {
      console.log('❌ Test tile failed to load');
    }
  } catch (error) {
    console.log('❌ Tile loading test failed:', error);
  }
}

testLayers();