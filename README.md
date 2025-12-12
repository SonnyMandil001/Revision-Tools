# Revision Tools

A lightweight flashcard app with a Python backend. Upload CSV files, review five-option questions, and let the scheduler prioritize what to study next based on accuracy and response time.

## Requirements
- Python 3.9+
- `pip install -r requirements.txt`

## Running locally
1. Install dependencies: `python -m pip install -r requirements.txt`
2. Start the server: `python app.py`
3. Open `http://localhost:5000` in your browser.

## CSV format
Use rows in the form: `question, option1, option2, option3, option4, option5, correct` where `correct` is `1-5` or `A-E`.

## How it works
- The backend parses your CSV and stores deck state in memory per browser session.
- `/api/next` returns the next prioritized card; `/api/answer` updates stats with your response time and accuracy.
- Daily answered counts and the calendar remain in-browser using `localStorage`.

## Smart review logic
Cards are scored with a mix of lower accuracy, slower response times, freshness, and a small random factor. The app samples from the top candidates to avoid repetition while focusing on what needs review.
