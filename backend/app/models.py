from pydantic import BaseModel


class Reference(BaseModel):
    label: str
    url: str


class InternalLink(BaseModel):
    label: str
    to: str


class Treatment(BaseModel):
    firstAid: list[str]
    seekCare: str
    references: list[Reference] = []


class Disease(BaseModel):
    id: str
    abbr: str
    name: str
    category: str
    keywords: list[str] = []
    summary: str
    keyPoints: list[str]
    references: list[Reference] = []
    treatment: Treatment | None = None


class ChatTurn(BaseModel):
    role: str          # "user" | "bot"
    text: str


class ChatRequest(BaseModel):
    message: str
    # Prior turns, so follow-ups like "is that serious?" resolve correctly.
    history: list[ChatTurn] = []


class ChatResponse(BaseModel):
    answer: str
    references: list[Reference] = []
    internalLinks: list[InternalLink] = []
    # Follow-up questions offered as tappable chips, so the reader has somewhere
    # to go next instead of an empty box.
    suggestions: list[str] = []


class PredictionResult(BaseModel):
    id: str
    name: str
    severity: str
    summary: str
    advice: str
    reasoning: str
    confidence: int


class Explanation(BaseModel):
    available: bool
    note: str
    maskUrl: str | None = None
    lesionUrl: str | None = None
    # The mask drawn back over the original frame. Real segmentation output.
    overlayUrl: str | None = None
    # Grad-CAM needs the classifier, so this stays null until that is wired.
    gradcamUrl: str | None = None


class PredictionResponse(BaseModel):
    results: list[PredictionResult]
    explanation: Explanation
