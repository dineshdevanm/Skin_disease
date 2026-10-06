from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db import get_database
from app.models import Disease

router = APIRouter(tags=["diseases"])


@router.get("/diseases", response_model=list[Disease])
async def list_diseases(q: str | None = None, db: AsyncIOMotorDatabase = Depends(get_database)):
    query: dict = {"type": "disease"}
    if q:
        query["$text"] = {"$search": q}

    cursor = db.knowledge_base.find(query)
    return await cursor.to_list(length=None)


@router.get("/diseases/{disease_id}", response_model=Disease)
async def get_disease(disease_id: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    doc = await db.knowledge_base.find_one({"type": "disease", "id": disease_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Disease not found")
    return doc
