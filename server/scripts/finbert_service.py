"""
FinBERT 情感分析微服务
使用 ProsusAI/finbert 模型对金融文本进行情感分析
启动: python finbert_service.py
依赖: pip install transformers torch flask
"""

import os
import json
from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

app = Flask(__name__)

MODEL_NAME = os.environ.get("FINBERT_MODEL", "ProsusAI/finbert")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

tokenizer = None
model = None


def load_model():
    global tokenizer, model
    if tokenizer is None:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        model.to(DEVICE)
        model.eval()


LABEL_MAP = {0: "positive", 1: "negative", 2: "neutral"}
LABEL_CN = {"positive": "积极", "negative": "消极", "neutral": "中性"}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL_NAME, "device": DEVICE})


@app.route("/analyze", methods=["POST"])
def analyze():
    load_model()
    data = request.get_json()
    texts = data.get("texts", [])

    if not texts:
        return jsonify({"error": "texts field is required"}), 400

    if len(texts) > 50:
        texts = texts[:50]

    results = []
    with torch.no_grad():
        for text in texts:
            inputs = tokenizer(
                text, return_tensors="pt", truncation=True, max_length=512, padding=True
            )
            inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
            outputs = model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)[0]

            label_idx = torch.argmax(probs).item()
            label = LABEL_MAP[label_idx]
            confidence = probs[label_idx].item()

            results.append({
                "text": text[:200],
                "sentiment": label,
                "sentimentCn": LABEL_CN[label],
                "confidence": round(confidence, 4),
                "scores": {
                    "positive": round(probs[0].item(), 4),
                    "negative": round(probs[1].item(), 4),
                    "neutral": round(probs[2].item(), 4),
                },
            })

    overall_scores = {"positive": 0, "negative": 0, "neutral": 0}
    for r in results:
        overall_scores[r["sentiment"]] += 1

    total = len(results)
    dominant = max(overall_scores, key=overall_scores.get)

    return jsonify({
        "results": results,
        "summary": {
            "total": total,
            "positive": overall_scores["positive"],
            "negative": overall_scores["negative"],
            "neutral": overall_scores["neutral"],
            "dominant": dominant,
            "dominantCn": LABEL_CN[dominant],
        },
    })


if __name__ == "__main__":
    port = int(os.environ.get("FINBERT_PORT", "5050"))
    print(f"Loading FinBERT model: {MODEL_NAME}")
    load_model()
    print(f"FinBERT service running on port {port}")
    app.run(host="0.0.0.0", port=port)
