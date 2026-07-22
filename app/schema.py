from typing import Optional

from pydantic import BaseModel


class LocationRequest(BaseModel):
    latitude: float
    longitude: float


class MinistrySearchRequest(BaseModel):
    # Optional: omit it to get the whole council of ministers, which is what
    # the web client's ministry picker loads once up front.
    name: Optional[str] = None

class UpdateMemberRequest(BaseModel):
    table_to_update: str
    name_field_to_update: str
    constituency_key: str
    field_to_update: str

class UpdateMinistryRequest(BaseModel):
    name_field_to_update: str
    ministry_name: str
    field_to_update: str