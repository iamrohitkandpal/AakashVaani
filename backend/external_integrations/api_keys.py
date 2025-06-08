import os
from dotenv import load_dotenv
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

class ApiKeyManager:
    """
    Manages API keys for external services
    """
    def __init__(self):
        # Ensure environment variables are loaded
        load_dotenv()
        
        # Load keys from environment
        self.keys = {
            'openweathermap': os.getenv('OPENWEATHERMAP_API_KEY', ''),
            'thunderforest': os.getenv('THUNDERFOREST_API_KEY', ''),
            'bhuvan': os.getenv('BHUVAN_API_KEY', ''),
            'nasa': os.getenv('NASA_API_KEY', '')
        }
        
        # Log which keys are available
        for service, key in self.keys.items():
            if key:
                logger.info(f"API key for {service} is available")
            else:
                logger.warning(f"API key for {service} is not available")
    
    def get(self, service: str) -> Optional[str]:
        """
        Get API key for a service
        
        Args:
            service: Service name
            
        Returns:
            API key or None if not available
        """
        key = self.keys.get(service.lower(), '')
        if not key:
            logger.warning(f"Requested API key for {service} not available")
        return key if key else None
    
    def all_keys(self) -> Dict[str, str]:
        """
        Get all API keys with sensitive parts masked
        
        Returns:
            Dictionary of API keys with sensitive parts masked
        """
        masked_keys = {}
        for service, key in self.keys.items():
            if key:
                # Mask the middle part of the key, showing only first 4 and last 4 chars
                if len(key) > 8:
                    masked_keys[service] = f"{key[:4]}{'*' * (len(key) - 8)}{key[-4:]}"
                else:
                    masked_keys[service] = "****"
            else:
                masked_keys[service] = None
        return masked_keys