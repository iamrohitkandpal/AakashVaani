async function testServiceWorker() {
  console.log('🧪 Testing Service Worker...');

  // Test registration
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('✅ Service Worker registered:', registration.scope);
    } catch (error) {
      console.log('❌ Service Worker registration failed:', error);
    }
  }

  // Test cache storage
  try {
    const cache = await caches.open('map-tiles-v2');
    console.log('✅ Cache storage accessible');
  } catch (error) {
    console.log('❌ Cache storage failed:', error);
  }
}

testServiceWorker();