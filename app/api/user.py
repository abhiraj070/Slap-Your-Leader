from main import app
from schema import LocationRequest
from app.db.connect import get_db
from sqlalchemy.orm import Session
from fastapi import Depends
import uuid
from app.model.user import User

@app.post("/add-user-location")
def add_user_location(request: LocationRequest, db: Session= Depends(get_db)):
    id= str(uuid.uuid4())
    user=User(id= id, latitude= request.latitude, longitude= request.longitude)
    