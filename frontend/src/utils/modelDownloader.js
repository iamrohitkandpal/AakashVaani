/**
 * Utility to download TensorFlow.js models for offline use with improved error handling
 */
import * as tf from '@tensorflow/tfjs';

/**
 * Downloads and caches a TensorFlow.js model with improved error handling and fallbacks
 * @param {string} modelUrl - Primary URL to download the model from
 * @param {string} localPath - IndexedDB path to store the model
 * @param {Array<string>} fallbackUrls - Optional array of fallback URLs if primary fails
 * @returns {Promise<boolean>} - Success status
 */
export async function downloadAndCacheModel(modelUrl, localPath, fallbackUrls = []) {
  // First check if model is already cached
  try {
    const cachedModel = await loadCachedModel(localPath);
    if (cachedModel) {
      console.log(`Model ${localPath} already cached, using existing version`);
      return true;
    }
  } catch (error) {
    console.log(`No cached model found at ${localPath}, will download`);
  }

  // Try the primary URL first
  try {
    console.log(`Attempting to download model from: ${modelUrl}`);
    
    // Add a timeout to the fetch operation
    const modelPromise = tf.loadLayersModel(modelUrl);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Model download timed out')), 15000);
    });
    
    // Use Promise.race to implement timeout
    const model = await Promise.race([modelPromise, timeoutPromise]);
    
    // Save the model to IndexedDB for offline use
    await model.save(`indexeddb://${localPath}`);
    
    console.log(`Model successfully downloaded and cached as: ${localPath}`);
    return true;
  } catch (error) {
    console.warn(`Failed to download model from ${modelUrl}:`, error);
    
    // Try fallback URLs if provided
    if (fallbackUrls && fallbackUrls.length > 0) {
      for (const fallbackUrl of fallbackUrls) {
        try {
          console.log(`Attempting fallback download from: ${fallbackUrl}`);
          const model = await tf.loadLayersModel(fallbackUrl);
          await model.save(`indexeddb://${localPath}`);
          console.log(`Model successfully downloaded from fallback and cached as: ${localPath}`);
          return true;
        } catch (fallbackError) {
          console.warn(`Failed to download from fallback ${fallbackUrl}:`, fallbackError);
        }
      }
    }
    
    // If we have a pre-trained model in public/models, try loading that
    try {
      const localModelUrl = `${process.env.PUBLIC_URL}/models/${localPath}/model.json`;
      console.log(`Attempting to load bundled model from: ${localModelUrl}`);
      const model = await tf.loadLayersModel(localModelUrl);
      await model.save(`indexeddb://${localPath}`);
      console.log(`Model successfully loaded from bundled source and cached as: ${localPath}`);
      return true;
    } catch (localError) {
      console.warn(`No bundled model available at ${localPath}:`, localError);
    }
    
    // All attempts failed
    return false;
  }
}

/**
 * Loads a cached model from IndexedDB
 * @param {string} localPath - IndexedDB path where the model is stored
 * @returns {Promise<tf.LayersModel|null>} The loaded model or null
 */
export async function loadCachedModel(localPath) {
  try {
    // Check if the model exists in IndexedDB
    const models = await tf.io.listModels();
    const modelPath = `indexeddb://${localPath}`;
    
    if (models[modelPath]) {
      // Try to load the model from IndexedDB
      const model = await tf.loadLayersModel(modelPath);
      console.log(`Model loaded from cache: ${localPath}`);
      return model;
    }
    return null;
  } catch (error) {
    console.warn(`Failed to load cached model ${localPath}:`, error);
    return null;
  }
}

/**
 * Create a simple offline test model if needed
 * @param {string} localPath - The path to save the model to
 * @returns {Promise<boolean>} Success status
 */
export async function createFallbackModel(localPath) {
  try {
    // Create a simple model if all else fails
    const model = tf.sequential();
    model.add(tf.layers.dense({units: 1, inputShape: [1]}));
    model.compile({loss: 'meanSquaredError', optimizer: 'sgd'});
    
    // Save it to IndexedDB
    await model.save(`indexeddb://${localPath}`);
    console.log(`Created fallback model and saved as: ${localPath}`);
    return true;
  } catch (error) {
    console.error(`Failed to create fallback model:`, error);
    return false;
  }
}