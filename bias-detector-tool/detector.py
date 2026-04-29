"""
AI Bias Firewall — Bias Detector Microservice
FastAPI server listening on :5001
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from attribute_extractor import extract_attributes
from proxy_detector import detect_proxies
from bias_scorer import calculate_input_bias_score

app = FastAPI(title="Bias Detector", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50_000)
    context: Optional[str] = "general"


class AnalyzeResponse(BaseModel):
    input_bias_score: float
    protected_attributes: list
    proxy_variables: list
    decision_points: list


@app.get("/health")
async def health():
    return {"status": "ok", "service": "bias-detector"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=422, detail="text must not be empty")

    attributes = extract_attributes(req.text)
    proxies = detect_proxies(req.text)
    score = calculate_input_bias_score(attributes, proxies)

    # Build decision points from proxy findings
    decision_points = [
        f"Proxy variable '{p['variable']}' detected — correlates with {p['mapped_to']}"
        for p in proxies
    ]

    return AnalyzeResponse(
        input_bias_score=score,
        protected_attributes=attributes,
        proxy_variables=proxies,
        decision_points=decision_points,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("detector:app", host="0.0.0.0", port=5001, reload=True)
