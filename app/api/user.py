from app.main import app
from app.schema import LocationRequest, MinistrySearchRequest, UpdateMinistryRequest, UpdateMemberRequest
from app.db.connect import get_db, engine
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException
from sqlalchemy import MetaData, Table, select, func, update
from sqlalchemy.exc import SQLAlchemyError

metadata= MetaData()
mla= Table("mlas", metadata, autoload_with= engine)
mp= Table("mps", metadata, autoload_with= engine)
ac= Table("assembly_constituencies", metadata, autoload_with= engine)
pc= Table("parliamentary_constituencies", metadata, autoload_with= engine)
manifesto= Table("party_manifesto_points", metadata, autoload_with=engine)
minister= Table("ministers", metadata, autoload_with= engine)

MEMBER_TABLES= {"mlas": mla, "mps": mp}

@app.post("/get-location")
def get_location(request: LocationRequest, db: Session= Depends(get_db)):
    try:
        latitude= request.latitude
        longitude= request.longitude

        user_point= func.ST_SetSRID(
            func.ST_Point(longitude, latitude),
            4326
        )

        stmt1= (select(mla.c.name, mla.c.party, mla.c.criminal_cases, mla.c.education, mla.c.photo_url, mla.c.slap_count, mla.c.rose_count, mla.c.constituency, mla.c.constituency_key, manifesto.c.points)
                .join(ac, (mla.c.constituency_key==ac.c.constituency_key) & (mla.c.state_key==ac.c.state_key))
                .join(manifesto, mla.c.party==manifesto.c.party)
                .where(func.ST_Contains(ac.c.geom, user_point))
        )

        stmt2= (select(mp.c.name, mp.c.party, mp.c.criminal_cases, mp.c.education, mp.c.photo_url, mp.c.slap_count, mp.c.rose_count, mp.c.constituency, mp.c.constituency_key, manifesto.c.points)
                .join(pc, (mp.c.constituency_key==pc.c.constituency_key) & (mp.c.state_key==pc.c.state_key))
                .join(manifesto, mp.c.party==manifesto.c.party)
                .where(func.ST_Contains(pc.c.geom, user_point))
        )

        final_mla= db.execute(stmt1).mappings().first()
        final_mp= db.execute(stmt2).mappings().first()
        return {"mla": final_mla, "mp": final_mp}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
    
@app.post("/get-minister")
def get_minister(request: MinistrySearchRequest, db: Session= Depends(get_db)):
    try:
        minister_name= request.name
        stmt= select(minister.c.ministry, minister.c.minister_name, minister.c.party, minister.c.photo_url, minister.c.slap_count, minister.c.rose_count, minister.c.manifesto_points)

        if not minister_name:
            all_ministers= db.execute(stmt.order_by(minister.c.ministry)).mappings().all()
            return {"ministers": all_ministers}

        final_minister_details= db.execute(stmt.where(minister.c.minister_name==minister_name)).mappings().first()

        return {"minister_details": final_minister_details}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
    
# Leaderboards: one per tier. Each returns the top 10 by slap_count and by
# rose_count, filtered to counts > 0 so an empty state can render cleanly.
# No request body — the client sends `{}`.
@app.post("/get-leaderboard-mla")
def get_leaderboard_mla(db: Session= Depends(get_db)):
    try:
        cols= (mla.c.name, mla.c.party, mla.c.constituency, mla.c.constituency_key,
               mla.c.photo_url, mla.c.slap_count, mla.c.rose_count)
        slap_toppers= db.execute(
            select(*cols).where(mla.c.slap_count > 0)
                         .order_by(mla.c.slap_count.desc())
                         .limit(10)
        ).mappings().all()
        rose_toppers= db.execute(
            select(*cols).where(mla.c.rose_count > 0)
                         .order_by(mla.c.rose_count.desc())
                         .limit(10)
        ).mappings().all()
        print("record:",slap_toppers)
        return {"slap_toppers": slap_toppers, "rose_toppers": rose_toppers}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.post("/get-leaderboard-mp")
def get_leaderboard_mp(db: Session= Depends(get_db)):
    try:
        cols= (mp.c.name, mp.c.party, mp.c.constituency, mp.c.constituency_key,
               mp.c.photo_url, mp.c.slap_count, mp.c.rose_count)
        slap_toppers= db.execute(
            select(*cols).where(mp.c.slap_count > 0)
                         .order_by(mp.c.slap_count.desc())
                         .limit(10)
        ).mappings().all()
        rose_toppers= db.execute(
            select(*cols).where(mp.c.rose_count > 0)
                         .order_by(mp.c.rose_count.desc())
                         .limit(10)
        ).mappings().all()
        return {"slap_toppers": slap_toppers, "rose_toppers": rose_toppers}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.post("/get-leaderboard-minister")
def get_leaderboard_minister(db: Session= Depends(get_db)):
    try:
        cols= (minister.c.minister_name, minister.c.party, minister.c.ministry,
               minister.c.photo_url, minister.c.slap_count, minister.c.rose_count)
        slap_toppers= db.execute(
            select(*cols).where(minister.c.slap_count > 0)
                         .order_by(minister.c.slap_count.desc())
                         .limit(10)
        ).mappings().all()
        rose_toppers= db.execute(
            select(*cols).where(minister.c.rose_count > 0)
                         .order_by(minister.c.rose_count.desc())
                         .limit(10)
        ).mappings().all()
        return {"slap_toppers": slap_toppers, "rose_toppers": rose_toppers}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.patch("/update-member-count")
def update_member_count(request: UpdateMemberRequest, db: Session= Depends(get_db)):
    try:
        table= request.table_to_update
        name= request.name_field_to_update
        constituency_key= request.constituency_key
        field= request.field_to_update
        metadata= MetaData()

        if field not in ("slap_count","rose_count"):
            raise HTTPException(status_code=400, detail=f"Cannot update {field} field")

        member= Table(table, metadata, autoload_with= engine)

        stmt= (update(member)
               .where((member.c.constituency_key==constituency_key) & (member.c.name==name))
               .values({field: member.c[field] + 1})
        )

        result= db.execute(stmt)
        db.commit()
        return {"rows_updated": result.rowcount}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
    

@app.patch("/update-ministry-count")
def update_ministry_count(request: UpdateMinistryRequest, db: Session= Depends(get_db)):
    try:
        field= request.field_to_update
        name= request.name_field_to_update
        ministry_name= request.ministry_name
        if field not in ("slap_count", "rose_count"):
            raise HTTPException(status_code=400, detail=f"Cannot update {field} field")

        member= minister

        stmt= (update(member)
                .where((member.c.ministry==ministry_name) & (member.c.minister_name==name))
                .values({field: member.c[field]+1})
        )

        result= db.execute(stmt)
        db.commit()
        return {"rows_updated": result.rowcount}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

