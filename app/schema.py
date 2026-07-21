from pydantic import BaseModel


class LocationRequest(BaseModel):
    latitude: float
    longitude: float


class MinistrySearchRequest(BaseModel):
    name: str

class UpdateMemberRequest(BaseModel):
    table_to_update: str
    name_field_to_update: str
    constituency_key: str
    field_to_update: str

class UpdateMinistryRequest(BaseModel):
    name_field_to_update: str
    ministry_name: str
    field_to_update: str