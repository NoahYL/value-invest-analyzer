# Value Invest Analyzer

A full-stack value investing analysis platform supporting both A-share (China) and US stock markets.

## Features

- **Stock Search** — Search by A-share code (600519), US ticker (PDD/AAPL), or Chinese company name
- **Company Profile** — Industry, business description, concept boards, revenue breakdown with margin analysis
- **Financial Metrics** — PE, PB, ROE, revenue, net profit, operating cashflow
- **K-line Chart** — Interactive candlestick chart with 3M/6M/1Y time range, real-time quote
- **Valuation Analysis** — Analyst consensus target price, PEG valuation, Graham intrinsic value, composite score
- **Industry Comparison** — Peer comparison table + bar chart for PE/PB/PS/ROE/market cap, with position indicator

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + ECharts 6 |
| Backend | Python FastAPI |
| A-share Data | AKShare + Eastmoney APIs (via curl_cffi) |
| US Stock Data | yfinance |
| Translation | deep-translator (Google) |

## Quick Start

### 1. Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start server (port 8000)
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (port 5173)
npm run dev
```

Open http://localhost:5173 in your browser.

## Project Structure

```
value-invest-analyzer/
├── backend/
│   ├── main.py                  # FastAPI app, API routes
│   ├── requirements.txt         # Python dependencies
│   └── services/
│       ├── stock_identifier.py  # Market type detection (A-share/US/name)
│       ├── ashare_service.py    # A-share company info + revenue
│       ├── us_stock_service.py  # US stock info via yfinance
│       ├── market_service.py    # Real-time quotes + K-line data
│       ├── valuation_service.py # Valuation analysis (consensus/PEG/Graham)
│       └── comparison_service.py# Industry peer comparison
└── frontend/
    ├── src/
    │   ├── App.jsx              # Main app, search, stock detail layout
    │   ├── App.css              # Global styles, two-column layout
    │   └── components/
    │       ├── MarketPanel.jsx  # Quote + candlestick chart
    │       ├── ValuationPanel.jsx # Valuation score + methods
    │       └── ComparisonPanel.jsx # Peer comparison table + chart
    ├── package.json
    └── vite.config.js
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/search?q=` | Search stock by code or name |
| `GET /api/quote?code=&market=` | Real-time quote |
| `GET /api/kline?code=&market=&period=` | K-line data (3m/6m/1y) |
| `GET /api/valuation?code=&market=` | Valuation analysis |
| `GET /api/comparison?code=&market=` | Industry peer comparison |

## License

MIT
