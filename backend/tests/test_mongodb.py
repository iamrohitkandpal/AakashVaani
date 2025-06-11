import pytest
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "aakash_vaani_db")

@pytest.mark.asyncio
async def test_mongodb_connection():
    """Test MongoDB connection and basic operations"""
    try:
        # Create client
        client = AsyncIOMotorClient(
            MONGO_URL,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000
        )
        
        # Test connection with ping
        await client.admin.command("ping")
        
        # Get database
        db = client[DB_NAME]
        
        # Test basic operations
        collection = db.test_collection
        
        # Insert test document
        test_doc = {"test": "data"}
        insert_result = await collection.insert_one(test_doc)
        assert insert_result.acknowledged
        
        # Find the document
        found_doc = await collection.find_one({"test": "data"})
        assert found_doc is not None
        assert found_doc["test"] == "data"
        
        # Clean up
        await collection.delete_one({"test": "data"})
        
        print("✅ MongoDB connection and operations test passed")
        return True
        
    except Exception as e:
        print(f"❌ MongoDB connection test failed: {e}")
        raise
    finally:
        if 'client' in locals():
            client.close()