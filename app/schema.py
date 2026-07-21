from pydantic import BaseModel


class LocationRequest(BaseModel):
    latitude: str
    longitude: str