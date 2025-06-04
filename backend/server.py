import logging
import asyncio
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from functools import lru_cache

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Aakash Vaani API", version="1.0.0")

# Shared HTTP client (reuse connections)
http_client = httpx.AsyncClient(timeout=15.0)

# Constants
USER_AGENT = "AakashVaaniApp/1.0"
DEFAULT_RADIUS_KM = 2.0
MAX_RADIUS_KM = 10.0
CACHE_LIFETIME_SECONDS = 3600  # 1 hour
RATE_LIMIT_CALLS = 100
RATE_LIMIT_PERIOD = 3600  # 1 hour

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request Models ---
class GeocodeRequest(BaseModel):
    query: str
    limit: Optional[int] = Field(5, ge=1, le=50)
    country_code: Optional[str] = None


class ReverseGeocodeRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    zoom: Optional[int] = Field(18, ge=1, le=18)


class NearbySearchRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    query: str
    radius_km: Optional[float] = Field(DEFAULT_RADIUS_KM, ge=0.1, le=MAX_RADIUS_KM)
    limit: Optional[int] = Field(20, ge=1, le=100)


class LocationResponse(BaseModel):
    id: str
    name: str
    type: str
    lat: float
    lng: float
    address: Dict[str, Any]
    distance: Optional[float] = None


# --- Utilities ---
@lru_cache(maxsize=1000)
def convert_query_to_amenity(query: str) -> str:
    """Convert user query to OSM amenity tag."""
    # Extended mapping
    mapping = {
        "hospital": "hospital",
        "clinic": "clinic",
        "doctor": "doctors",
        "atm": "atm",
        "restaurant": "restaurant",
        "school": "school",
        "college": "college",
        "university": "university",
        "bank": "bank",
        "pharmacy": "pharmacy",
        "chemist": "pharmacy",
        "bus": "bus_station",
        "bus stop": "bus_stop",
        "police": "police",
        "hotel": "hotel",
        "cafe": "cafe",
        "park": "park",
        "garden": "garden",
        "fuel": "fuel",
        "petrol": "fuel",
        "gas station": "fuel",
        "temple": "place_of_worship",
        "church": "place_of_worship",
        "mosque": "place_of_worship",
        "supermarket": "supermarket",
        "grocery": "supermarket",
        "mall": "mall",
        "market": "marketplace",
        "cinema": "cinema",
        "theater": "theatre",
        "library": "library",
        "post office": "post_office",
        "gym": "gym",
        "fitness": "fitness_centre",
        "airport": "aeroway=terminal",
        "bar": "bar",
        "pub": "pub",
        "station": "station",
        "train": "station",
        "fire": "fire_station",
    }
    q = query.lower().strip()
    return mapping.get(q, q)


def format_location_response(data: Dict) -> LocationResponse:
    """Format response data to a standardized format."""
    try:
        return LocationResponse(
            id=data.get("place_id", data.get("id", str(data.get("osm_id", "")))),
            name=data.get("name", data.get("display_name", "")),
            type=data.get("type", data.get("category", "amenity")),
            lat=float(data.get("lat", 0)),
            lng=float(data.get("lon", 0)),
            address=data.get("address", {}),
            distance=data.get("distance", None)
        )
    except Exception as e:
        logger.error(f"Error formatting location: {e}")
        # Return minimal data to avoid complete failure
        return LocationResponse(
            id=str(data.get("osm_id", "")),
            name=data.get("display_name", "Unknown"),
            type="unknown",
            lat=0.0,
            lng=0.0,
            address={}
        )


# --- Rate limiting ---
call_counts = {}

async def check_rate_limit(client_ip: str) -> bool:
    """Simple rate limiting mechanism."""
    now = asyncio.get_event_loop().time()
    if client_ip not in call_counts:
        call_counts[client_ip] = {"count": 1, "reset_at": now + RATE_LIMIT_PERIOD}
        return True
    
    client = call_counts[client_ip]
    if now > client["reset_at"]:
        client["count"] = 1
        client["reset_at"] = now + RATE_LIMIT_PERIOD
        return True
        
    if client["count"] > RATE_LIMIT_CALLS:
        return False
        
    client["count"] += 1
    return True


# --- Routes ---
@app.get("/")
async def root():
    """API health check and info."""
    return {"status": "online", "service": "GeoVoice API", "version": "1.0.0"}


@app.post("/geocode", response_model=List[LocationResponse])
async def geocode(req: GeocodeRequest, background_tasks: BackgroundTasks, request: Request):
    """
    Forward geocoding using Nominatim.
    """
    # Get client IP for rate limiting
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not await check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": req.query,
        "format": "json",
        "limit": req.limit,
        "addressdetails": 1,
    }
    
    if req.country_code:
        params["countrycodes"] = req.country_code
        
    headers = {"User-Agent": USER_AGENT}
    try:
        response = await http_client.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        # Format the responses
        results = [format_location_response(item) for item in data]
        return results
        
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error during geocode request: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=f"External API error: {str(e)}")
        
    except httpx.RequestError as e:
        logger.error(f"Request error during geocode request: {e}")
        raise HTTPException(status_code=503, detail=f"Error connecting to geocoding service: {str(e)}")
        
    except Exception as e:
        logger.error(f"Unexpected error during geocode request: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/reverse-geocode", response_model=LocationResponse)
async def reverse_geocode(req: ReverseGeocodeRequest, request: Request):
    """
    Reverse geocoding using Nominatim.
    """
    # Get client IP for rate limiting
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not await check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    url = "https://nominatim.openstreetmap.org/reverse"
    params = {
        "lat": req.lat,
        "lon": req.lng,
        "format": "json",
        "addressdetails": 1,
        "zoom": req.zoom,
    }
    headers = {"User-Agent": USER_AGENT}
    
    try:
        response = await http_client.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        # Format the response
        return format_location_response(data)
        
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error during reverse geocode request: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=f"External API error: {str(e)}")
        
    except httpx.RequestError as e:
        logger.error(f"Request error during reverse geocode request: {e}")
        raise HTTPException(status_code=503, detail=f"Error connecting to geocoding service: {str(e)}")
        
    except Exception as e:
        logger.error(f"Unexpected error during reverse geocode request: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/nearby", response_model=Dict[str, Any])
async def nearby_search(req: NearbySearchRequest, request: Request):
    """
    Nearby POI search using Overpass API.
    """
    # Get client IP for rate limiting
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not await check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    amenity = convert_query_to_amenity(req.query)
    overpass_url = "https://overpass-api.de/api/interpreter"
    
    # Convert radius to meters for Overpass API
    radius_km = req.radius_km if req.radius_km is not None else DEFAULT_RADIUS_KM
    radius_meters = int(radius_km * 1000)
    
    # Build Overpass QL query
    overpass_query = f"""
    [out:json][timeout:25];
    (
      node["{amenity}"](around:{radius_meters},{req.lat},{req.lng});
      way["{amenity}"](around:{radius_meters},{req.lat},{req.lng});
      relation["{amenity}"](around:{radius_meters},{req.lat},{req.lng});
    );
    out center body {req.limit};
    """
    
    try:
        response = await http_client.post(
            overpass_url,
            data={"data": overpass_query},
            headers={"User-Agent": USER_AGENT}
        )
        response.raise_for_status()
        data = response.json()
        
        # Process results
        results = []
        for element in data.get("elements", []):
            try:
                # Get coordinates (nodes have lat/lon directly, ways/relations have center)
                lat = element.get("lat", element.get("center", {}).get("lat"))
                lon = element.get("lon", element.get("center", {}).get("lon"))
                
                if not lat or not lon:
                    continue
                    
                # Get properties from tags
                tags = element.get("tags", {})
                name = tags.get("name", f"{amenity.capitalize()} #{element['id']}")
                
                # Build address
                address = {}
                for key, value in tags.items():
                    if key.startswith("addr:"):
                        address[key.replace("addr:", "")] = value
                
                # Calculate distance (approximation using Haversine formula)
                # This would be implemented separately
                
                results.append({
                    "id": str(element["id"]),
                    "name": name,
                    "type": element["type"],
                    "lat": float(lat),
                    "lng": float(lon),
                    "tags": tags,
                    "address": address
                })
                
            except Exception as e:
                logger.error(f"Error processing POI element: {e}")
        
        # Sort results by distance (we would calculate distance here)
        # For now, just return as-is
        return {
            "query": req.query,
            "amenity": amenity,
            "count": len(results),
            "results": results
        }
        
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error during nearby search: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=f"External API error: {str(e)}")
        
    except httpx.RequestError as e:
        logger.error(f"Request error during nearby search: {e}")
        raise HTTPException(status_code=503, detail=f"Error connecting to Overpass API: {str(e)}")
        
    except Exception as e:
        logger.error(f"Unexpected error during nearby search: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/categories")
async def get_categories():
    """Return available search categories."""
    categories = {
        "restaurant": {"name": "Restaurants", "icon": "🍽️"},
        "food": {"name": "Food & Dining", "icon": "🍔"},
        "hospital": {"name": "Hospitals", "icon": "🏥"},
        "pharmacy": {"name": "Pharmacies", "icon": "💊"},
        "bank": {"name": "Banks & ATMs", "icon": "🏦"},
        "gas": {"name": "Gas Stations", "icon": "⛽"},
        "school": {"name": "Schools", "icon": "🏫"},
        "university": {"name": "Universities", "icon": "🎓"},
        "hotel": {"name": "Hotels", "icon": "🏨"},
        "shopping": {"name": "Shopping", "icon": "🛍️"},
        "park": {"name": "Parks", "icon": "🌳"},
        "gym": {"name": "Gyms & Fitness", "icon": "💪"},
        "police": {"name": "Police Stations", "icon": "👮"},
        "post": {"name": "Post Offices", "icon": "📮"},
        "transit": {"name": "Public Transit", "icon": "🚌"}
    }
    
    return categories


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown."""
    logger.info("Shutting down application")
    
    # Close the HTTP client
    if http_client:
        await http_client.aclose()
    
    logger.info("All resources closed")


# Entry point for standalone execution
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
