# Marriott Finder – OCR + LLM Search

This repo turns a handful of screenshot images (150 Marriott India properties) into an interactive search where you can type:

```
show me marriott properties in delhi with less than 30k points per night
```

— and instantly get a list back.

## Quick-start

```bash
# 1. Install dependencies
npm install

# 2. Place your `data/hotels.csv` (generated externally)
#    The file must have the header:
#    Brand,Hotel,City,AvgPtValue,AvgPtsNight,AvgPts5Nights

# 3. Export your OpenAI key (or add to .env)
export OPENAI_API_KEY=sk-....

# 4. Launch the server + UI on http://localhost:3000
npm start
```

Open your browser, type any natural-language filter and enjoy 🎉.

## How it works
1. **`server.js`** – loads the CSV, exposes `POST /search`. Each request:
   1. Sends the user's sentence to OpenAI → JSON filter.
   2. Validates JSON (Ajv).
   3. Applies the filter to the in-memory array and returns matches.
2. **`public/`** – tiny Bootstrap page + fetch logic.

## License
MIT – do anything you like, but please don't publish your OpenAI key. 