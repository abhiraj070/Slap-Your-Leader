from app.db.connect import Base
from sqlalchemy import Integer, Column, String

class User(Base):
    __tablename__= "User"

    id= Column(Integer, primary_key=True)
    longitude= Column(String, nullable= False)
    latitude= Column(String, nullable= False)
