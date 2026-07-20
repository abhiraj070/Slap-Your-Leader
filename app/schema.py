from pydantic import BaseModel


class locationRequest(BaseModel):
    latitude: str
    longitude: str