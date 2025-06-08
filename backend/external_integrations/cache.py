from typing import Dict, Any, Optional
import time
import json
import os
import logging

logger = logging.getLogger(__name__)

class FileCache:
    """
    Simple file-based cache for offline data
    """
    def __init__(self, cache_dir: str = "cache", ttl: int = 3600):
        """
        Initialize the cache
        
        Args:
            cache_dir: Directory to store cache files
            ttl: Cache TTL in seconds (default: 1 hour)
        """
        self.cache_dir = cache_dir
        self.ttl = ttl
        
        # Create cache directory if it doesn't exist
        if not os.path.exists(cache_dir):
            try:
                os.makedirs(cache_dir)
            except Exception as e:
                logger.error(f"Failed to create cache directory: {e}")
    
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Get item from cache
        
        Args:
            key: Cache key
            
        Returns:
            Cached data or None if not found/expired
        """
        file_path = os.path.join(self.cache_dir, f"{key}.json")
        
        if not os.path.exists(file_path):
            return None
        
        try:
            with open(file_path, 'r') as f:
                cache_data = json.load(f)
            
            # Check if expired
            if time.time() - cache_data['timestamp'] > self.ttl:
                return None
            
            return cache_data['data']
        except Exception as e:
            logger.error(f"Error reading cache for {key}: {e}")
            return None
    
    def set(self, key: str, data: Dict[str, Any]) -> bool:
        """
        Set item in cache
        
        Args:
            key: Cache key
            data: Data to cache
            
        Returns:
            True if successful, False otherwise
        """
        file_path = os.path.join(self.cache_dir, f"{key}.json")
        
        try:
            with open(file_path, 'w') as f:
                json.dump({
                    'timestamp': time.time(),
                    'data': data
                }, f)
            return True
        except Exception as e:
            logger.error(f"Error writing cache for {key}: {e}")
            return False