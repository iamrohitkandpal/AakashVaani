import os
import uuid
import logging
import asyncio
import motor.motor_asyncio
import httpx
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from functools import lru_cache
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from httpx import RequestError

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Constants
USER_AGENT = "AakashVaaniApp/1.0"
DEFAULT_RADIUS_KM = 2.0
MAX_RADIUS_KM = 10.0
CACHE_LIFETIME_SECONDS = 3600
RATE_LIMIT_CALLS = 100
RATE_LIMIT_PERIOD = 3600

# CORS configuration
allowed_origins = ["http://localhost:3000", "https://aakash-vaani.example.com"]
if os.getenv("ENVIRONMENT") == "development":
    allowed_origins = ["*"]

# Load environment variables
load_dotenv()

# MongoDB setup with better error handling
MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "aakash_vaani_db")

if not MONGO_URL:
    logger.error("MONGO_URL environment variable not set")
    raise ValueError("MONGO_URL environment variable not set")

# MongoDB client initialization with proper options and error handling
try:
    mongo_client = motor.motor_asyncio.AsyncIOMotorClient(
        MONGO_URL,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=5000,
        maxPoolSize=50
    )
    db = mongo_client[DB_NAME] if mongo_client else None
    if db is not None:
        logger.info(f"MongoDB client initialized with database {DB_NAME}")
    else:
        raise RuntimeError("Failed to get database handle")
except Exception as e:
    logger.error(f"Failed to initialize MongoDB client: {e}")
    mongo_client = None
    db = None

# Global flag for DB status
db_is_connected: bool = False

# Request Models
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

# Utilities
@lru_cache(maxsize=1000)
def convert_query_to_amenity(query: str) -> str:
    """Convert user query to OSM amenity tag."""
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
    return mapping.get(query.lower().strip(), query.lower().strip())

def format_location_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """Format response data to a standardized format."""
    try:
        lat = float(data.get("lat", 0.0))
        lng = float(data.get("lon", 0.0))
        return {
            "id": str(data.get("place_id", data.get("osm_id", uuid.uuid4()))),
            "name": data.get("name", data.get("display_name", "Unknown location")),
            "type": data.get("type", "place"),
            "lat": lat,
            "lng": lng,
            "address": data.get("address", {}),
            "distance": data.get("distance")
        }
    except (ValueError, TypeError) as e:
        logger.error(f"Error formatting location response: {e}")
        return {
            "id": str(uuid.uuid4()),
            "name": "Error processing location",
            "type": "error",
            "lat": 0.0,
            "lng": 0.0,
            "address": {},
            "distance": None
        }

# Rate limiting
call_counts: Dict[str, Dict[str, Any]] = {}

async def check_rate_limit(client_ip: str) -> bool:
    """Simple rate limiting mechanism."""
    now = asyncio.get_event_loop().time()
    if client_ip not in call_counts:
        call_counts[client_ip] = {
            "count": 1,
            "reset_at": now + RATE_LIMIT_PERIOD
        }
        return True

    client = call_counts[client_ip]
    if now > client["reset_at"]:
        client["count"] = 1
        client["reset_at"] = now + RATE_LIMIT_PERIOD
        return True

    if client["count"] >= RATE_LIMIT_CALLS:
        return False

    client["count"] += 1
    return True

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_is_connected
    try:
        # Validate mongo_client
        if mongo_client is None:
            raise RuntimeError("MongoDB client not initialized")
            
        # Test connection with ping
        await mongo_client.admin.command("ping")
        logger.info(f"Successfully connected to MongoDB at {MONGO_URL}")
        
        # Validate database handle
        if db is None:
            raise RuntimeError("MongoDB database handle is not available")
            
        # Create indexes with proper error handling
        try:
            await safe_db_operation(
                "create_indexes",
                db.searches.create_index,
                [("timestamp", -1)]
            )
            await safe_db_operation(
                "create_indexes",
                db.markers.create_index,
                [("timestamp", -1)]
            )
            await safe_db_operation(
                "create_indexes",
                db.users.create_index,
                [("email", 1)],
                unique=True
            )
            logger.info("Database indexes created successfully")
        except Exception as e:
            logger.error(f"Failed to create indexes: {e}")
            raise
        
        db_is_connected = True
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB or create indexes: {e}")
        db_is_connected = False

    yield

    # Cleanup
    if mongo_client is not None:
        try:
            mongo_client.close()
            logger.info("MongoDB connection closed")
        except Exception as e:
            logger.error(f"Error closing MongoDB connection: {e}")

# FastAPI instance
app = FastAPI(
    title="Aakash Vaani API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request validation middleware
@app.middleware("http")
async def validate_request(request: Request, call_next):
    if request.method == "POST" and request.headers.get("content-type") != "application/json":
        return JSONResponse(
            status_code=400,
            content={"detail": "Content-Type must be application/json for POST requests"}
        )
    return await call_next(request)

# Routes
@app.get("/")
async def root():
    """Root endpoint - also serves as health check"""
    return {
        "name": "Aakash Vaani API",
        "version": "1.0.0",
        "status": "online",
        "database_connected": db_is_connected,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.post("/geocode", response_model=List[Dict[str, Any]])
async def geocode(request: GeocodeRequest, background_tasks: BackgroundTasks):
    """Geocode a location query"""
    try:
        params = {
            "q": request.query,
            "limit": request.limit,
            "format": "json",
            "addressdetails": 1
        }
        if request.country_code:
            params["countrycodes"] = request.country_code

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers={"User-Agent": USER_AGENT}
            )
            response.raise_for_status()
            results = response.json()

        formatted_results = [
            {
                "lat": float(result["lat"]),
                "lng": float(result["lon"]),
                "name": result["display_name"],
                "type": result.get("type", "unknown"),
                "address": result.get("address", {})
            }
            for result in results
        ]

        # Update database check
        if db_is_connected and db is not None:
            try:
                background_tasks.add_task(
                    db.searches.insert_one,
                    {
                        "query": request.query,
                        "timestamp": datetime.now(timezone.utc),
                        "results_count": len(formatted_results),
                        "type": "geocode"
                    }
                )
            except Exception as e:
                logger.error(f"Failed to log search: {e}")

        return formatted_results
    except RequestError as e:
        logger.error(f"Request failed: {e}")
        raise HTTPException(status_code=503, detail="External service unavailable")
    except Exception as e:
        logger.error(f"Error in geocoding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/reverse-geocode", response_model=Dict[str, Any])
async def reverse_geocode(req: ReverseGeocodeRequest):
    """Reverse geocode a location"""
    try:
        params = {
            "lat": req.lat,
            "lon": req.lng,
            "zoom": req.zoom,
            "format": "json",
            "addressdetails": 1
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params=params,
                headers={"User-Agent": USER_AGENT}
            )
            response.raise_for_status()
            result = response.json()

        return format_location_response(result)
    except RequestError as e:
        logger.error(f"Request failed: {e}")
        raise HTTPException(status_code=503, detail="External service unavailable")
    except Exception as e:
        logger.error(f"Error in reverse geocoding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/nearby", response_model=List[Dict[str, Any]])
async def nearby_search(request: NearbySearchRequest):
    """Search for nearby points of interest"""
    try:
        amenity = convert_query_to_amenity(request.query)
        overpass_url = "https://overpass-api.de/api/interpreter"
        radius_km = request.radius_km if request.radius_km is not None else DEFAULT_RADIUS_KM
        radius_meters = radius_km * 1000

        query = f"""
        [out:json][timeout:25];
        (
          node["amenity"="{amenity}"](around:{radius_meters},{request.lat},{request.lng});
          way["amenity"="{amenity}"](around:{radius_meters},{request.lat},{request.lng});
          relation["amenity"="{amenity}"](around:{radius_meters},{request.lat},{request.lng});
        );
        out center;
        """

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(overpass_url, content=query)
            response.raise_for_status()
            result = response.json()

        pois = []
        for element in result.get("elements", []):
            try:
                if element.get("type") == "node":
                    lat = element.get("lat")
                    lon = element.get("lon")
                elif "center" in element:
                    lat = element["center"].get("lat")
                    lon = element["center"].get("lon")
                else:
                    continue

                if lat is None or lon is None:
                    continue

                distance_km = ((lat - request.lat)**2 + (lon - request.lng)**2)**0.5 * 111
                tags = element.get("tags", {})

                poi = {
                    "id": str(element.get("id", uuid.uuid4())),
                    "name": tags.get("name", f"{amenity.title()} {element.get('id', '')}"),
                    "type": amenity,
                    "lat": lat,
                    "lng": lon,
                    "distance": round(distance_km, 2),
                    "address": {
                        "road": tags.get("addr:street"),
                        "city": tags.get("addr:city"),
                        "country": tags.get("addr:country")
                    },
                    "details": {
                        "website": tags.get("website"),
                        "phone": tags.get("phone"),
                        "opening_hours": tags.get("opening_hours")
                    }
                }
                pois.append(poi)
            except Exception as e:
                logger.error(f"Error processing POI element: {e}")

        pois.sort(key=lambda x: x.get("distance", float('inf')))
        return pois[:request.limit]
    except RequestError as e:
        logger.error(f"Request failed: {e}")
        raise HTTPException(status_code=503, detail="External service unavailable")
    except Exception as e:
        logger.error(f"Error in nearby search: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/categories")
async def get_categories():
    """Get available POI categories"""
    return [
        {"key": "restaurant", "name": "Restaurants", "icon": "🍽️"},
        {"key": "cafe", "name": "Cafes", "icon": "☕"},
        {"key": "hotel", "name": "Hotels", "icon": "🏨"},
        {"key": "hospital", "name": "Hospitals", "icon": "🏥"},
        {"key": "pharmacy", "name": "Pharmacies", "icon": "💊"},
        {"key": "bank", "name": "Banks", "icon": "🏦"},
        {"key": "atm", "name": "ATMs", "icon": "💳"},
        {"key": "school", "name": "Schools", "icon": "🏫"},
        {"key": "park", "name": "Parks", "icon": "🌳"},
        {"key": "supermarket", "name": "Supermarkets", "icon": "🛒"}
    ]

@app.post("/sync/searches")
async def sync_searches(
    data: List[Dict], 
    request: Request,
    background_tasks: BackgroundTasks
):
    """Sync saved searches from client to server"""
    if db is None or not db_is_connected:
        logger.warning("Database not connected - storing sync request in memory")
        return {
            "status": "queued",
            "message": "Database offline - changes will sync when connection is restored"
        }

    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    result = {"synced": 0, "failed": 0, "ids": []}
    
    for item in data:
        try:
            item["server_timestamp"] = datetime.now(timezone.utc)
            background_tasks.add_task(
                db.searches.insert_one,
                item
            )
            result["synced"] += 1
            result["ids"].append(str(item.get("_id", uuid.uuid4())))
        except Exception as e:
            logger.error(f"Failed to sync search item: {e}")
            result["failed"] += 1

    return result

@app.post("/sync/markers")
async def sync_markers(data: List[Dict], request: Request, background_tasks: BackgroundTasks):
    """Sync custom map markers from client to server"""
    if db is None or not db_is_connected:
        raise HTTPException(
            status_code=503, 
            detail="Database not connected"
        )

    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    result = {"synced": 0, "failed": 0, "ids": []}
    for marker in data:
        try:
            marker["server_timestamp"] = datetime.now(timezone.utc)
            marker_id = marker.get("id", str(uuid.uuid4()))
            marker["id"] = marker_id
            background_tasks.add_task(
                db.markers.update_one,
                {"id": marker_id},
                {"$set": marker},
                upsert=True
            )
            result["synced"] += 1
            result["ids"].append(marker_id)
        except Exception as e:
            logger.error(f"Failed to sync marker: {e}")
            result["failed"] += 1

    return result

@app.get("/offline/data")
async def get_offline_data(request: Request):
    """Get essential data for offline usage"""
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    offline_bundle = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "categories": [
            {"key": "restaurant", "name": "Restaurants", "icon": "🍽️"},
            {"key": "cafe", "name": "Cafes", "icon": "☕"},
            {"key": "hotel", "name": "Hotels", "icon": "🏨"},
            {"key": "hospital", "name": "Hospitals", "icon": "🏥"},
            {"key": "pharmacy", "name": "Pharmacies", "icon": "💊"},
            {"key": "bank", "name": "Banks", "icon": "🏦"},
            {"key": "atm", "name": "ATMs", "icon": "💳"}
        ],
        "default_locations": [
            {"name": "New Delhi, India", "lat": 28.6139, "lng": 77.2090},
            {"name": "Mumbai, India", "lat": 19.0760, "lng": 72.8777},
            {"name": "Kolkata, India", "lat": 22.5726, "lng": 88.3639}
        ],
        "command_examples": [
            {"command": "find restaurants near me", "type": "search"},
            {"command": "show satellite map", "type": "layer"},
            {"command": "zoom in", "type": "zoom"},
            {"command": "navigate to central park", "type": "navigate"}
        ],
        "recent_searches": []
    }

    if db_is_connected and db is not None:
        try:
            recent_searches = await db.searches.find().sort("timestamp", -1).limit(10).to_list(10)
            offline_bundle["recent_searches"] = [
                {**search, "_id": str(search["_id"])} for search in recent_searches
            ]
        except Exception as e:
            logger.error(f"Failed to get recent searches: {e}")
            # Don't fail the whole request if just recent searches fail
            offline_bundle["recent_searches"] = []

    return offline_bundle

@app.get("/api-keys/status")
async def get_api_key_status():
    """Get the status of API keys (masked)"""
    def mask_key(key: Optional[str]) -> Optional[str]:
        if not key:
            return None
        if len(key) <= 8:
            return "*" * len(key)
        return f"{key[:4]}{'*' * (len(key) - 8)}{key[-4:]}"

    return {
        "status": "ok",
        "keys": {
            "openweathermap": {
                "available": bool(os.getenv("OPENWEATHERMAP_API_KEY")),
                "masked": mask_key(os.getenv("OPENWEATHERMAP_API_KEY"))
            },
            "thunderforest": {
                "available": bool(os.getenv("THUNDERFOREST_API_KEY")),
                "masked": mask_key(os.getenv("THUNDERFOREST_API_KEY"))
            },
            "bhuvan": {
                "available": bool(os.getenv("BHUVAN_API_KEY")),
                "masked": mask_key(os.getenv("BHUVAN_API_KEY"))
            },
            "nasa": {
                "available": bool(os.getenv("NASA_API_KEY")),
                "masked": mask_key(os.getenv("NASA_API_KEY"))
            }
        }
    }

@app.get("/health/mongodb")
async def check_mongodb_health():
    """Check MongoDB connection health"""
    try:
        if mongo_client is None:
            return {
                "status": "error",
                "message": "MongoDB client not initialized"
            }
            
        await mongo_client.admin.command("ping")
        
        if db is None:
            return {
                "status": "error",
                "message": "Database handle not available"
            }
            
        return {
            "status": "healthy",
            "database": DB_NAME,
            "connected": db_is_connected
        }
    except Exception as e:
        logger.error(f"MongoDB health check failed: {e}")
        return {
            "status": "error",
            "message": str(e)
        }

# Add after other utility functions
async def safe_db_operation(operation: str, func, *args, **kwargs) -> Optional[Any]:
    """Safely execute database operations with proper error handling."""
    if not db_is_connected or db is None:
        logger.warning(f"Database not available for operation: {operation}")
        return None
    
    try:
        return await func(*args, **kwargs)
    except Exception as e:
        logger.error(f"Database operation failed - {operation}: {e}")
        return None

__all__ = ["app"]  # Export app for uvicorn