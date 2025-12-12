import csv
import io
import random
import uuid
from typing import Dict, List, Optional

from flask import Flask, jsonify, request, send_from_directory, session

app = Flask(__name__, static_folder=".", static_url_path="")
app.secret_key = "flashcard-secret-key"

Deck = Dict[str, object]
DECKS: Dict[str, Deck] = {}


@app.route("/api/upload", methods=["POST"])
def upload_csv():
    if "file" not in request.files:
        return jsonify({"error": "No CSV uploaded"}), 400

    file = request.files["file"]
    try:
        content = file.stream.read().decode("utf-8")
    except UnicodeDecodeError:
        return jsonify({"error": "Could not decode file as UTF-8"}), 400

    cards = parse_cards(content)
    if not cards:
        return (
            jsonify({"error": "No valid cards found. Ensure 7 columns per row."}),
            400,
        )

    deck_id = session.get("deck_id") or str(uuid.uuid4())
    session["deck_id"] = deck_id
    DECKS[deck_id] = {"cards": cards}

    return jsonify({"count": len(cards)})


@app.route("/api/next", methods=["GET"])
def next_card():
    deck = get_deck()
    if not deck:
        return jsonify({"error": "Upload a CSV to start."}), 400

    card = select_next_card(deck["cards"])
    if not card:
        return jsonify({"error": "No cards available."}), 400

    return jsonify({"card": public_card(card), "remaining": len(deck["cards"])})


@app.route("/api/answer", methods=["POST"])
def submit_answer():
    deck = get_deck()
    if not deck:
        return jsonify({"error": "Upload a CSV to start."}), 400

    data = request.get_json(silent=True) or {}
    try:
        card_id = int(data.get("cardId"))
        selected_index = int(data.get("selectedIndex"))
        elapsed_ms = max(0, int(data.get("elapsedMs", 0)))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid answer payload."}), 400

    card = find_card(deck["cards"], card_id)
    if card is None:
        return jsonify({"error": "Card not found."}), 404

    card["seen"] += 1
    card["total_time_ms"] += elapsed_ms
    correct = selected_index == card["correct_index"]
    if correct:
        card["correct"] += 1

    return jsonify(
        {
            "correct": correct,
            "correctIndex": card["correct_index"],
            "remaining": len(deck["cards"]),
        }
    )


@app.route("/")
def root():
    return send_from_directory(app.static_folder, "index.html")


def get_deck() -> Optional[Deck]:
    deck_id = session.get("deck_id")
    if not deck_id:
        return None
    return DECKS.get(deck_id)


def parse_cards(content: str) -> List[Dict[str, object]]:
    cards: List[Dict[str, object]] = []
    reader = csv.reader(io.StringIO(content))
    for idx, row in enumerate(reader):
        if len(row) < 7:
            continue
        question = row[0].strip()
        options = [opt.strip() for opt in row[1:6]]
        correct_raw = row[6].strip()
        correct_index = normalize_correct_index(correct_raw)

        if not question or any(not opt for opt in options) or correct_index is None:
            continue

        cards.append(
            {
                "id": idx,
                "question": question,
                "options": options,
                "correct_index": correct_index,
                "seen": 0,
                "correct": 0,
                "total_time_ms": 0,
            }
        )
    return cards


def normalize_correct_index(value: str) -> Optional[int]:
    if value is None:
        return None
    value = value.strip()
    if value.isdigit():
        number = int(value)
        if 1 <= number <= 5:
            return number - 1
    mapping = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}
    return mapping.get(value.upper())


def find_card(cards: List[Dict[str, object]], card_id: int) -> Optional[Dict[str, object]]:
    for card in cards:
        if card["id"] == card_id:
            return card
    return None


def select_next_card(cards: List[Dict[str, object]]) -> Optional[Dict[str, object]]:
    if not cards:
        return None
    scored = [(compute_priority(card), card) for card in cards]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    top = scored[: max(1, min(5, len(scored)))]
    return random.choice(top)[1]


def compute_priority(card: Dict[str, object]) -> float:
    seen = card["seen"] or 0
    correct = card["correct"] or 0
    total_time_ms = card["total_time_ms"] or 0

    accuracy = correct / seen if seen else 0
    avg_time = total_time_ms / seen if seen else 8000
    time_penalty = min(avg_time / 8000, 2)
    freshness = max(0.3, 1 - seen * 0.05)
    randomness = random.random() * 0.1

    return (1 - accuracy) * 2 + time_penalty + freshness + randomness


def public_card(card: Dict[str, object]) -> Dict[str, object]:
    return {
        "id": card["id"],
        "question": card["question"],
        "options": card["options"],
    }


if __name__ == "__main__":
    app.run(debug=True)
