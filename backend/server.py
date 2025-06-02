from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Get MongoDB connection details from environment variables
try:
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'aakash_vaani_db')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    logging.info(f"Connected to MongoDB at {mongo_url}, using database {db_name}")
except Exception as e:
    logging.error(f"Failed to connect to MongoDB: {e}")
    # We'll continue without database for now to allow the app to start

# Create the main app
app = FastAPI(title="Aakash Vaani API", 
              description="Backend API for the Aakash Vaani voice-controlled mapping application")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class ErrorResponse(BaseModel):
    detail: str

# Add routes to the router
@api_router.get("/")
async def root():
    return {"message": "Aakash Vaani API is running", "version": "1.0.0"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    try:
        status_dict = input.dict()
        status_obj = StatusCheck(**status_dict)
        if 'db' in globals():
            _ = await db.status_checks.insert_one(status_obj.dict())
        return status_obj
    except Exception as e:
        logging.error(f"Error creating status check: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    try:
        if 'db' not in globals():
            return []
        status_checks = await db.status_checks.find().to_list(1000)
        return [StatusCheck(**status_check) for status_check in status_checks]
    except Exception as e:
        logging.error(f"Error getting status checks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Health check endpoint
@api_router.get("/health")
async def health_check():
    try:
        if 'db' in globals():
            # Simple ping to check if database is responsive
            await db.command("ping")
            return {"status": "healthy", "database": "connected"}
        return {"status": "healthy", "database": "not configured"}
    except Exception as e:
        logging.error(f"Health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}

# Include the router in the main app
app.include_router(api_router)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_db_client():
    logger.info("Starting up application")

@app.on_event("shutdown")
async def shutdown_db_client():
    if 'client' in globals():
        client.close()
        logger.info("Closed MongoDB connection")
