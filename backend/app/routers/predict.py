from fastapi import APIRouter, File, UploadFile

from app.models import PredictionResponse
from app.services.model_service import predict_image

router = APIRouter(tags=["predict"])


@router.post("/predict", response_model=PredictionResponse)
async def predict(image: UploadFile = File(...)):
    image_bytes = await image.read()
    return predict_image(image_bytes)
