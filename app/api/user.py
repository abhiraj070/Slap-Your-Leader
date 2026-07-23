from app.main import app
from app.schema import LocationRequest, MinistrySearchRequest, UpdateMinistryRequest, UpdateMemberRequest, GetMinisterRequest, GetMpRequest
from app.db.connect import get_db, engine
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, Query
from sqlalchemy import MetaData, Table, select, func, update
from sqlalchemy.exc import SQLAlchemyError

metadata= MetaData()
mp= Table("mps", metadata, autoload_with= engine)
pc= Table("parliamentary_constituencies", metadata, autoload_with= engine)
manifesto= Table("party_manifesto_points", metadata, autoload_with=engine)
minister= Table("ministers", metadata, autoload_with= engine)

# MLA support removed — the only member table left is `mps`.
MEMBER_TABLES= {"mps": mp}


@app.post("/get-location")
def get_location(request: LocationRequest, db: Session= Depends(get_db)):
    try:
        latitude= request.latitude
        longitude= request.longitude

        user_point= func.ST_SetSRID(
            func.ST_Point(longitude, latitude),
            4326
        )

        stmt= (select(mp.c.name, mp.c.party, mp.c.criminal_cases, mp.c.education, mp.c.photo_url, mp.c.slap_count, mp.c.rose_count, mp.c.constituency, mp.c.constituency_key, manifesto.c.points)
                .join(pc, (mp.c.constituency_key==pc.c.constituency_key) & (mp.c.state_key==pc.c.state_key))
                .join(manifesto, mp.c.party==manifesto.c.party)
                .where(func.ST_Contains(pc.c.geom, user_point))
        )

        final_mp= db.execute(stmt).mappings().first()
        return {"mp": final_mp}
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


@app.get("/get-leaderboard-mp")
def get_leaderboard_mp(offset:int= Query(0,ge=0,le=100), limit: int= Query(10,ge=1,le=100), db: Session= Depends(get_db)):
    try:
        cols= (mp.c.name, mp.c.party, mp.c.constituency, mp.c.constituency_key,
               mp.c.photo_url, mp.c.slap_count, mp.c.rose_count)
        slap_toppers= db.execute(
            select(*cols).order_by(mp.c.slap_count.desc(), mp.c.id.asc())
                         .limit(limit)
                         .offset(offset)
        ).mappings().all()
        rose_toppers= db.execute(
            select(*cols).order_by(mp.c.rose_count.desc(), mp.c.id.asc())
                         .limit(limit)
                         .offset(offset)

        ).mappings().all()
        print("res:",slap_toppers)
        return {"slap_toppers": slap_toppers, "rose_toppers": rose_toppers}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.get("/get-leaderboard-minister")
def get_leaderboard_minister(limit:int= Query(10,ge=1,le=100), offset: int= Query(0,ge=0,le=100),db: Session= Depends(get_db)):
    try:
        cols= (minister.c.minister_name, minister.c.party, minister.c.ministry,
               minister.c.photo_url, minister.c.slap_count, minister.c.rose_count)
        slap_toppers= db.execute(
            select(*cols).order_by(minister.c.slap_count.desc(), minister.c.id.asc())
                         .limit(limit)
                         .offset(offset)
        ).mappings().all()
        rose_toppers= db.execute(
            select(*cols).order_by(minister.c.rose_count.desc(), minister.c.id.asc())
                         .limit(limit)
                         .offset(offset)
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

        if field not in ("slap_count","rose_count"):
            raise HTTPException(status_code=400, detail=f"Cannot update {field} field")

        if table not in MEMBER_TABLES:
            raise HTTPException(status_code=400, detail=f"Cannot update {table} table")

        member= MEMBER_TABLES[table]

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


@app.post("/get-ministers-by-name")
def get_minister_by_name(request: GetMinisterRequest, db: Session= Depends(get_db)):
    try:
        name= request.name
        ministry= request.ministry
        stmt= (
            select(minister.c.ministry, minister.c.minister_name, minister.c.party,
                   minister.c.photo_url, minister.c.slap_count, minister.c.rose_count,
                   minister.c.manifesto_points)
            .where((minister.c.minister_name==name) & (minister.c.ministry==ministry))
        )
        minister_details= db.execute(stmt).mappings().first()
        return {"minister_details": minister_details}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.post("/get-mps-by-name")
def get_mp_by_name(request: GetMpRequest, db: Session= Depends(get_db)):
    try:
        name= request.name
        constituency_key= request.constituency_key
        stmt= (
            select(mp.c.name, mp.c.party, mp.c.criminal_cases, mp.c.education,
                   mp.c.photo_url, mp.c.slap_count, mp.c.rose_count,
                   mp.c.constituency, mp.c.constituency_key, manifesto.c.points)
            .join(manifesto, mp.c.party==manifesto.c.party)
            .where((mp.c.name==name) & (mp.c.constituency_key==constituency_key))
        )
        mp_details= db.execute(stmt).mappings().first()
        return {"mp_details": mp_details}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
