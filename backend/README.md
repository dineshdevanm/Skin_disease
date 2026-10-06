# DermaScan backend

FastAPI + MongoDB backend for the DermaScan frontend. Serves:

- `POST /api/chat` — skin-health chatbot. MongoDB's text index retrieves the
  relevant reference documents and a small local LLM (Qwen2.5-0.5B-Instruct)
  phrases an answer **from those documents only**. Greetings and questions about
  the user's own skin are answered without retrieval or generation, and treatment
  answers are quoted from the knowledge base rather than generated.
  `POST /api/chat/stream` is the same thing over server-sent events.
- `GET /api/diseases`, `GET /api/diseases/{id}` — the ISIC 2019 disease library, sourced from MongoDB.
- `POST /api/predict` — skin lesion prediction, running real trained weights:
  DeepLabV3-ResNet50 for segmentation, MedLiT for the 7-class HAM10000
  classification, plus Grad-CAM. Returns the mask, the cropped lesion, the
  overlay and the Grad-CAM heatmap as data URLs. **The uploaded photo is never
  written to disk or to the database.**
- `GET /api/health` — health check; reports `degraded` with HTTP 503 when MongoDB is unreachable.

Both checkpoints live in the project root (`best_model.pth`,
`best_model_medlit_classif_HAM.pth`); point `SEGMENTATION_MODEL_PATH` /
`CLASSIFIER_MODEL_PATH` elsewhere if yours are somewhere else. The API degrades
gracefully when a checkpoint is missing rather than failing to start.

## Local setup

1. Have a MongoDB instance available — either [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier is enough) or a local `mongod`.
2. `cp .env.example .env` and fill in `MONGODB_URI` (and `ALLOWED_ORIGINS` if your frontend runs somewhere other than `http://localhost:5173`).
3. Create the virtual environment:
   - Windows: `python -m venv .venv` then `.venv\Scripts\activate`
   - macOS/Linux: `python -m venv .venv && source .venv/bin/activate`
4. `pip install -r requirements.txt`
5. Seed the database (loads `app/data/seed_data.json` and creates the text index used for chat retrieval):
   ```
   python -m app.seed
   ```
6. Run the server:
   ```
   python -m uvicorn app.main:app --port 8000 --reload
   ```
   API is now at `http://localhost:8000`, docs at `http://localhost:8000/docs`.

   On Windows PowerShell, `&&` is not a valid separator — run each command on its
   own line. If port 8000 gives `WinError 10013`, something already holds it:
   `netstat -ano | findstr :8000` to find the PID, then `taskkill /PID <pid> /F`.

   The chat model (~1 GB) downloads from Hugging Face on first run and is then
   cached. It is loaded in the background at startup, so the first chat message
   does not pay for it.

Point the frontend at it by setting `VITE_API_URL=http://localhost:8000/api` in the frontend's `.env`.

## Adding more diseases later

Add entries to `app/data/seed_data.json` (same shape as the existing ones — `type: "disease"` or `type: "topic"`) and re-run `python -m app.seed`. It upserts by `id`, so it's safe to re-run any time. Since this is the single source of truth for both the Disease Library and the chatbot, new diseases are automatically searchable by the chatbot too.

## Deployment

### Vercel
This repo includes `vercel.json` + `api/index.py` for Vercel's Python runtime. Deploy the `backend/` directory as its own Vercel project, and set `MONGODB_URI` / `MONGODB_DB_NAME` / `ALLOWED_ORIGINS` as environment variables in the Vercel project settings. Use a MongoDB Atlas cluster (Vercel's serverless functions can't reach a `localhost` database).

### AWS
A `Dockerfile` is included — build and run it on ECS/Fargate, EC2, or App Runner:
```bash
docker build -t dermascan-backend .
docker run -p 8000:8000 --env-file .env dermascan-backend
```
Point `MONGODB_URI` at an Atlas cluster or a self-hosted MongoDB reachable from your AWS network.

## Where the real model goes later

`app/services/model_service.py` exposes a single function, `predict_image(image_bytes) -> PredictionResponse`. That's the entire integration surface for the real model — load it once (e.g. at module import time or app startup) and replace the body of that function with real inference. Nothing else in the API layer needs to change.
