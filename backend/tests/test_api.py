import sys
import os
from pathlib import Path

# Add the parent directory to Python path
sys.path.append(str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_geocoding():
    response = client.post("/geocode", json={
        "query": "Taj Mahal",
        "limit": 3
    })
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert "lat" in data[0]
    assert "lng" in data[0]

def test_nearby_search():
    response = client.post("/nearby", json={
        "lat": 28.6139,
        "lng": 77.2090,
        "query": "restaurant",
        "radius_km": 2
    })
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_categories():
    response = client.get("/categories")
    assert response.status_code == 200
    categories = response.json()
    assert len(categories) > 0