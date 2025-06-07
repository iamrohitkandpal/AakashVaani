import os
import httpx
import logging
import asyncio
import motor.motor_asyncio
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from functools import lru_cache
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
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

# More secure CORS configuration
allowed_origins = [
    "http://localhost:3000",
    "https://aakash-vaani.example.com"
]

if os.getenv("ENVIRONMENT") == "development":
    # In development, allow all origins
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Load environment variables
load_dotenv()

# MongoDB setup
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "aakash_vaani_db")

# Create MongoDB client
mongo_client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]


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
            distance=data.get("distance", None),
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
            address={},
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
async def geocode(
    req: GeocodeRequest, background_tasks: BackgroundTasks, request: Request
):
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
        raise HTTPException(
            status_code=e.response.status_code, detail=f"External API error: {str(e)}"
        )

    except httpx.RequestError as e:
        logger.error(f"Request error during geocode request: {e}")
        raise HTTPException(
            status_code=503, detail=f"Error connecting to geocoding service: {str(e)}"
        )

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
        raise HTTPException(
            status_code=e.response.status_code, detail=f"External API error: {str(e)}"
        )

    except httpx.RequestError as e:
        logger.error(f"Request error during reverse geocode request: {e}")
        raise HTTPException(
            status_code=503, detail=f"Error connecting to geocoding service: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Unexpected error during reverse geocode request: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/nearby", response_model=List[LocationResponse])
async def nearby_search(req: NearbySearchRequest, request: Request):
    """
    Search for nearby points of interest.
    """
    # Get client IP for rate limiting
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not await check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    try:
        # Convert query to OSM amenity tag
        amenity = convert_query_to_amenity(req.query)
        
        # Build Overpass query with radius in meters (convert from km)
        radius_km = req.radius_km if req.radius_km is not None else DEFAULT_RADIUS_KM
        radius_m = int(radius_km * 1000)
        
        # Limit radius to reasonable value
        if radius_m > MAX_RADIUS_KM * 1000:
            radius_m = MAX_RADIUS_KM * 1000
            
        overpass_query = f"""
        [out:json];
        node["amenity"="{amenity}"](around:{radius_m},{req.lat},{req.lng});
        out body {req.limit};
        """
        
        headers = {"User-Agent": USER_AGENT}
        params = {"data": overpass_query}
        
        response = await http_client.get(
            "https://overpass-api.de/api/interpreter",
            params=params,
            headers=headers
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Error from Overpass API: {response.text}"
            )
        
        data = response.json()
        
        # Process results
        results = []
        for element in data.get("elements", []):
            if element.get("type") == "node":
                lat = element.get("lat")
                lng = element.get("lon")
                
                # Calculate distance from query point
                from math import sin, cos, sqrt, atan2, radians
                
                R = 6371.0  # Earth radius in km
                
                lat1 = radians(req.lat)
                lon1 = radians(req.lng)
                lat2 = radians(lat)
                lon2 = radians(lng)
                
                dlon = lon2 - lon1
                dlat = lat2 - lat1
                
                a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
                c = 2 * atan2(sqrt(a), sqrt(1 - a))
                
                distance = R * c  # Distance in km
                
                # Build location response
                location = LocationResponse(
                    id=str(element.get("id", "")),
                    name=element.get("tags", {}).get("name", f"{amenity.title()} #{len(results)+1}"),
                    type=amenity,
                    lat=lat,
                    lng=lng,
                    address={},  # We would need a geocoder to get address details
                    distance=distance
                )
                
                results.append(location)
        
        # Sort by distance
        results.sort(key=lambda x: x.distance)
        
        # Limit results
        results = results[:req.limit]
        
        return results
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in nearby search: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/categories")
async def get_categories():
    """
    Get available POI categories.
    """
    categories = [
        {"key": "restaurant", "name": "Restaurants", "icon": "🍽️"},
        {"key": "hospital", "name": "Hospitals", "icon": "🏥"},
        {"key": "pharmacy", "name": "Pharmacies", "icon": "💊"},
        {"key": "school", "name": "Schools", "icon": "🏫"},
        {"key": "cafe", "name": "Cafes", "icon": "☕"},
        {"key": "bank", "name": "Banks", "icon": "🏦"},
        {"key": "atm", "name": "ATMs", "icon": "💰"},
        {"key": "fuel", "name": "Gas Stations", "icon": "⛽"},
        {"key": "bus_station", "name": "Bus Stations", "icon": "🚌"},
        {"key": "train_station", "name": "Train Stations", "icon": "🚆"},
        {"key": "park", "name": "Parks", "icon": "🌳"},
        {"key": "supermarket", "name": "Supermarkets", "icon": "🛒"},
    ]
    return categories


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown."""
    logger.info("Shutting down application")

    # Close the HTTP client
    if http_client:
        await http_client.aclose()

    logger.info("All resources closed")


# Add this to your startup event
@app.on_event("startup")
async def startup_db_client():
    try:
        # Verify database connection
        await mongo_client.admin.command('ping')
        logger.info(f"Connected to MongoDB at {MONGO_URL}")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        # Don't raise exception to allow app to start without DB


# Add this to your shutdown event
@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()
    logger.info("Closed MongoDB connection")


# Entry point for standalone execution
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
