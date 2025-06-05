/**
 * Utility to download TensorFlow.js models for offline use with improved error handling
 */
import * as tf from '@tensorflow/tfjs';

class ModelDownloader {
  constructor() {
    this.modelStatus = new Map();
    this.baseStoragePath = '/models';
    this.indexedDbName = 'aakash-vaani-models';
    this.supportedModels = [
      {
        id: 'speech-commands',
        url: 'https://storage.googleapis.com/tfjs-models/tfjs/speech-commands/v0.4/browser_fft/18w/metadata.json',
        size: 2400000, // approx size in bytes
        description: 'Speech command recognition model',
        // Package to import when loading this model
        importInfo: {
          package: '@tensorflow-models/speech-commands',
          className: 'SpeechCommandRecognizer',
          creator: 'create'
        }
      },
      {
        id: 'toxicity',
        url: 'https://storage.googleapis.com/tfjs-models/tfjs/toxicity/v1/model.json',
        size: 27000000, // approx size in bytes
        description: 'Toxicity detection for content moderation',
        importInfo: {
          package: '@tensorflow-models/toxicity',
          className: 'load',
          options: { threshold: 0.9 }
        }
      },
      {
        id: 'posenet',
        url: 'https://storage.googleapis.com/tfjs-models/savedmodel/posenet/mobilenet/float/050/model-stride16.json',
        size: 13000000, // approx size in bytes
        description: 'Pose estimation for gesture control',
        importInfo: {
          package: '@tensorflow-models/posenet',
          className: 'load',
          options: {
            architecture: 'MobileNetV1',
            outputStride: 16,
            multiplier: 0.75
          }
        }
      }
    ];

    // Initialize TensorFlow.js backend
    this.initializeTfBackend();
  }

  /**
   * Initialize TensorFlow.js backend
   */
  async initializeTfBackend() {
    try {
      // Use WebGL backend if available for better performance, fall back to CPU
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('TensorFlow.js is loaded, version:', tf.version.tfjs);
      console.log('Using backend:', tf.getBackend());
    } catch (error) {
      console.warn('Failed to initialize WebGL backend, falling back to CPU:', error);
      try {
        await tf.setBackend('cpu');
        await tf.ready();
        console.log('TensorFlow.js is using CPU backend, version:', tf.version.tfjs);
      } catch (cpuError) {
        console.error('Failed to initialize TensorFlow.js:', cpuError);
      }
    }
  }

  /**
   * Check if IndexedDB is available and accessible
   * @returns {Promise<boolean>} True if IndexedDB is available
   */
  async isIndexedDbAvailable() {
    if (!window.indexedDB) {
      console.error('IndexedDB not supported by this browser');
      return false;
    }

    try {
      // Test opening a temporary database
      const request = window.indexedDB.open('test-idb-availability', 1);
      
      return new Promise((resolve) => {
        request.onerror = () => {
          console.error('IndexedDB access denied or error');
          resolve(false);
        };
        
        request.onsuccess = () => {
          const db = request.result;
          db.close();
          // Try to delete the test database
          try {
            window.indexedDB.deleteDatabase('test-idb-availability');
          } catch (e) {
            console.warn('Could not delete test database', e);
          }
          resolve(true);
        };
      });
    } catch (error) {
      console.error('Error testing IndexedDB availability:', error);
      return false;
    }
  }

  /**
   * Get list of available models
   * @returns {Array} List of model metadata
   */
  getAvailableModels() {
    return this.supportedModels.map(model => ({
      id: model.id,
      description: model.description,
      size: model.size,
      status: this.modelStatus.get(model.id) || 'not_downloaded'
    }));
  }

  /**
   * Check if a model is downloaded and available offline
   * @param {string} modelId The ID of the model to check
   * @returns {Promise<boolean>} True if model is available offline
   */
  async isModelDownloaded(modelId) {
    try {
      if (!(await this.isIndexedDbAvailable())) {
        return false;
      }

      // Check if model exists in IndexedDB
      const model = this.supportedModels.find(m => m.id === modelId);
      if (!model) {
        console.error(`Model ${modelId} not found in supported models`);
        return false;
      }

      // Using TensorFlow.js to check if model exists in IndexedDB
      try {
        const modelInfo = await tf.io.listModels();
        const modelPath = `indexeddb://${this.indexedDbName}/${modelId}`;
        return modelInfo[modelPath] !== undefined;
      } catch (error) {
        console.warn(`Error checking model in IndexedDB: ${error}`);
        
        // Fall back to our manual database check
        const db = await this.openModelDatabase();
        
        return new Promise((resolve) => {
          const transaction = db.transaction('models', 'readonly');
          const store = transaction.objectStore('models');
          const request = store.get(modelId);
          
          request.onsuccess = () => {
            const modelInfo = request.result;
            resolve(!!modelInfo && modelInfo.downloaded);
          };
          
          request.onerror = () => {
            console.error(`Error checking if model ${modelId} is downloaded:`, request.error);
            resolve(false);
          };
          
          transaction.oncomplete = () => {
            db.close();
          };
        });
      }
    } catch (error) {
      console.error(`Error checking if model ${modelId} is downloaded:`, error);
      return false;
    }
  }

  /**
   * Open or create the model database
   * @returns {Promise<IDBDatabase>} IndexedDB database instance
   */
  async openModelDatabase() {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(this.indexedDbName, 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object store for models if it doesn't exist
        if (!db.objectStoreNames.contains('models')) {
          const store = db.createObjectStore('models', { keyPath: 'id' });
          store.createIndex('downloaded', 'downloaded', { unique: false });
          store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }
      };
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('Error opening model database:', request.error);
        reject(new Error('Could not open model database'));
      };
    });
  }

  /**
   * Download a model for offline use
   * @param {string} modelId The ID of the model to download
   * @param {Function} progressCallback Optional callback for download progress
   * @returns {Promise<boolean>} True if download was successful
   */
  async downloadModel(modelId, progressCallback = null) {
    try {
      if (!(await this.isIndexedDbAvailable())) {
        throw new Error('IndexedDB not available - cannot download model');
      }

      const model = this.supportedModels.find(m => m.id === modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found in supported models`);
      }

      // Update status
      this.modelStatus.set(modelId, 'downloading');
      if (progressCallback) progressCallback(0);

      // Actual model loading and saving
      try {
        // Dynamically import the model package
        const modelModule = await this.dynamicallyImportModel(model.importInfo.package);
        
        if (!modelModule) {
          throw new Error(`Failed to import model package ${model.importInfo.package}`);
        }
        
        // Create model instance based on the model type
        let modelInstance;
        
        if (progressCallback) progressCallback(30);
        
        // Different loading methods depending on the model
        switch (modelId) {
          case 'speech-commands': {
            // Speech Commands model requires explicit initialization
            const recognizer = modelModule[model.importInfo.creator]('BROWSER_FFT');
            await recognizer.ensureModelLoaded();
            modelInstance = recognizer;
            break;
          }
            
          case 'toxicity': {
            // Toxicity model takes a threshold parameter
            const options = model.importInfo.options || { threshold: 0.9 };
            modelInstance = await modelModule[model.importInfo.className](options);
            break;
          }
            
          case 'posenet': {
            // PoseNet model takes configuration options
            const options = model.importInfo.options || {};
            modelInstance = await modelModule[model.importInfo.className](options);
            break;
          }
            
          default:
            throw new Error(`Unsupported model type: ${modelId}`);
        }
        
        if (progressCallback) progressCallback(70);
        
        // Save the model to IndexedDB for offline use
        if (modelInstance) {
          const modelPath = `indexeddb://${this.indexedDbName}/${modelId}`;
          
          if ('save' in modelInstance) {
            await modelInstance.save(modelPath);
          } else if (modelInstance.model && 'save' in modelInstance.model) {
            await modelInstance.model.save(modelPath);
          } else {
            console.warn('Model does not have direct save method, storing metadata only');
          }
        }
        
        if (progressCallback) progressCallback(90);
      } catch (error) {
        console.error(`Error loading model ${modelId}:`, error);
        throw error;
      }

      // After download completes, store model info in IndexedDB
      const db = await this.openModelDatabase();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('models', 'readwrite');
        const store = transaction.objectStore('models');
        
        // Create or update model record
        const modelRecord = {
          id: modelId,
          downloaded: true,
          lastUpdated: new Date().toISOString(),
          url: model.url,
          size: model.size,
          description: model.description
        };
        
        const request = store.put(modelRecord);
        
        request.onsuccess = () => {
          this.modelStatus.set(modelId, 'downloaded');
          if (progressCallback) progressCallback(100);
          resolve(true);
        };
        
        request.onerror = () => {
          console.error(`Error saving model ${modelId} info:`, request.error);
          this.modelStatus.set(modelId, 'error');
          reject(new Error(`Could not save model ${modelId} info`));
        };
        
        transaction.oncomplete = () => {
          db.close();
        };
      });
    } catch (error) {
      console.error(`Error downloading model ${modelId}:`, error);
      this.modelStatus.set(modelId, 'error');
      return false;
    }
  }

  /**
   * Dynamically import a TensorFlow.js model package
   * @param {string} packageName Name of the package to import
   * @returns {Promise<any>} The imported module
   */
  async dynamicallyImportModel(packageName) {
    try {
      switch (packageName) {
        case '@tensorflow-models/speech-commands':
          return await import('@tensorflow-models/speech-commands');
        case '@tensorflow-models/toxicity':
          return await import('@tensorflow-models/toxicity');
        case '@tensorflow-models/posenet':
          return await import('@tensorflow-models/posenet');
        default:
          console.error(`Unknown package: ${packageName}`);
          return null;
      }
    } catch (error) {
      console.error(`Error importing ${packageName}:`, error);
      return null;
    }
  }

  /**
   * Delete a downloaded model
   * @param {string} modelId The ID of the model to delete
   * @returns {Promise<boolean>} True if deletion was successful
   */
  async deleteModel(modelId) {
    try {
      if (!(await this.isIndexedDbAvailable())) {
        throw new Error('IndexedDB not available - cannot delete model');
      }

      // Update status
      this.modelStatus.set(modelId, 'deleting');

      // Delete the model from TensorFlow.js model store
      try {
        const modelPath = `indexeddb://${this.indexedDbName}/${modelId}`;
        await tf.io.removeModel(modelPath);
      } catch (error) {
        console.warn(`Error removing TensorFlow model from IndexedDB: ${error}`);
        // Continue with deletion from our own database
      }
      
      const db = await this.openModelDatabase();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('models', 'readwrite');
        const store = transaction.objectStore('models');
        
        // First check if model exists
        const getRequest = store.get(modelId);
        
        getRequest.onsuccess = () => {
          const modelInfo = getRequest.result;
          
          if (!modelInfo) {
            this.modelStatus.set(modelId, 'not_downloaded');
            resolve(true);
            return;
          }
          
          // Delete the model record
          const deleteRequest = store.delete(modelId);
          
          deleteRequest.onsuccess = () => {
            this.modelStatus.set(modelId, 'not_downloaded');
            resolve(true);
          };
          
          deleteRequest.onerror = () => {
            console.error(`Error deleting model ${modelId}:`, deleteRequest.error);
            this.modelStatus.set(modelId, 'error');
            reject(new Error(`Could not delete model ${modelId}`));
          };
        };
        
        getRequest.onerror = () => {
          console.error(`Error checking model ${modelId} before deletion:`, getRequest.error);
          this.modelStatus.set(modelId, 'error');
          reject(new Error(`Could not access model ${modelId} for deletion`));
        };
        
        transaction.oncomplete = () => {
          db.close();
        };
      });
    } catch (error) {
      console.error(`Error deleting model ${modelId}:`, error);
      this.modelStatus.set(modelId, 'error');
      return false;
    }
  }

  /**
   * Load a model for use in the app
   * @param {string} modelId The ID of the model to load
   * @returns {Promise<Object>} The loaded model or null on failure
   */
  async loadModel(modelId) {
    try {
      // Check if model is downloaded
      const isDownloaded = await this.isModelDownloaded(modelId);
      
      if (!isDownloaded) {
        console.warn(`Model ${modelId} not downloaded, attempting to download now`);
        const downloadSuccess = await this.downloadModel(modelId);
        
        if (!downloadSuccess) {
          throw new Error(`Failed to download model ${modelId}`);
        }
      }
      
      // Load the model package and create the model instance
      const model = this.supportedModels.find(m => m.id === modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found in supported models`);
      }
      
      // Dynamically import the model package
      const modelModule = await this.dynamicallyImportModel(model.importInfo.package);
      if (!modelModule) {
        throw new Error(`Failed to import model package ${model.importInfo.package}`);
      }
      
      // Try to load from IndexedDB first
      const modelPath = `indexeddb://${this.indexedDbName}/${modelId}`;
      let modelInstance;
      
      try {
        // Different loading methods depending on the model
        switch (modelId) {
          case 'speech-commands': {
            // Speech Commands model requires explicit creation
            const recognizer = modelModule[model.importInfo.creator]('BROWSER_FFT');
            // Try loading from IndexedDB, if fails, it will use the default model
            await recognizer.ensureModelLoaded();
            modelInstance = recognizer;
            break;
          }
            
          case 'toxicity': {
            // Try loading from IndexedDB first
            try {
              modelInstance = await tf.loadGraphModel(modelPath);
            } catch (e) {
              // Fall back to creating a new instance
              const options = model.importInfo.options || { threshold: 0.9 };
              modelInstance = await modelModule[model.importInfo.className](options);
            }
            break;
          }
            
          case 'posenet': {
            // Try loading from IndexedDB first
            try {
              modelInstance = await tf.loadGraphModel(modelPath);
            } catch (e) {
              // Fall back to creating a new instance
              const options = model.importInfo.options || {};
              modelInstance = await modelModule[model.importInfo.className](options);
            }
            break;
          }
            
          default:
            throw new Error(`Unsupported model type: ${modelId}`);
        }
        
        console.log(`Model ${modelId} loaded successfully`);
        
        return {
          id: modelId,
          status: 'loaded',
          model: modelInstance,
          predict: async (input) => {
            try {
              switch (modelId) {
                case 'speech-commands':
                  return await modelInstance.recognize(input);
                case 'toxicity':
                  return await modelInstance.classify(input);
                case 'posenet':
                  return await modelInstance.estimatePoses(input);
                default:
                  throw new Error(`Prediction not implemented for model ${modelId}`);
              }
            } catch (error) {
              console.error(`Error during prediction with model ${modelId}:`, error);
              throw error;
            }
          }
        };
      } catch (error) {
        console.error(`Error loading model ${modelId}:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`Error loading model ${modelId}:`, error);
      return null;
    }
  }

  /**
   * Get storage usage information
   * @returns {Promise<Object>} Storage usage stats
   */
  async getStorageInfo() {
    try {
      if (!(await this.isIndexedDbAvailable())) {
        throw new Error('IndexedDB not available - cannot get storage info');
      }
      
      const db = await this.openModelDatabase();
      
      return new Promise((resolve) => {
        const transaction = db.transaction('models', 'readonly');
        const store = transaction.objectStore('models');
        const index = store.index('downloaded');
        const request = index.getAll(true);
        
        request.onsuccess = () => {
          const downloadedModels = request.result;
          
          const totalSize = downloadedModels.reduce((total, model) => total + (model.size || 0), 0);
          
          resolve({
            downloadedModels: downloadedModels.length,
            totalSizeBytes: totalSize,
            totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
            models: downloadedModels.map(model => ({
              id: model.id,
              sizeBytes: model.size,
              sizeMB: Math.round(model.size / (1024 * 1024) * 100) / 100,
              lastUpdated: model.lastUpdated
            }))
          });
        };
        
        request.onerror = () => {
          console.error('Error getting storage info:', request.error);
          resolve({
            downloadedModels: 0,
            totalSizeBytes: 0,
            totalSizeMB: 0,
            models: []
          });
        };
        
        transaction.oncomplete = () => {
          db.close();
        };
      });
    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        downloadedModels: 0,
        totalSizeBytes: 0,
        totalSizeMB: 0,
        models: [],
        error: error.message
      };
    }
  }
}

export const modelDownloader = new ModelDownloader();
export default modelDownloader;