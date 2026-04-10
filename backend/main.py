from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from services.stock_identifier import identify_market
from services.ashare_service import search_ashare_by_code, search_by_name
from services.us_stock_service import search_us_stock
from services.market_service import (
    get_ashare_quote, get_us_quote,
    get_ashare_kline, get_us_kline,
)
from services.valuation_service import get_ashare_valuation, get_us_valuation
from services.comparison_service import get_ashare_comparison, get_us_comparison

app = FastAPI(title="价值投资分析平台")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/search")
def search_stock(q: str = Query(..., min_length=1, description="股票代码或公司名称")):
    market = identify_market(q)

    if market == "a_share":
        result = search_ashare_by_code(q)
        if result:
            return {"status": "ok", "data": result}
        return {"status": "error", "message": f"未找到A股代码 {q} 对应的股票"}

    if market == "a_share_name":
        results = search_by_name(q)
        if results:
            return {"status": "ok", "data": results, "type": "list"}
        return {"status": "error", "message": f"未找到包含「{q}」的股票"}

    if market == "us_stock":
        result = search_us_stock(q)
        if result:
            return {"status": "ok", "data": result}
        return {"status": "error", "message": f"未找到美股代码 {q} 对应的股票"}

    return {"status": "error", "message": "无法识别输入，请输入6位A股代码、美股代码或中文公司名"}


@app.get("/api/quote")
def get_quote(
    code: str = Query(..., description="股票代码"),
    market: str = Query(..., description="市场: A股 / 美股"),
):
    if market == "A股":
        data = get_ashare_quote(code)
    else:
        data = get_us_quote(code)

    if data:
        return {"status": "ok", "data": data}
    return {"status": "error", "message": "获取实时报价失败"}


@app.get("/api/kline")
def get_kline(
    code: str = Query(..., description="股票代码"),
    market: str = Query(..., description="市场: A股 / 美股"),
    period: str = Query("3m", description="时间范围: 3m / 6m / 1y"),
):
    if market == "A股":
        data = get_ashare_kline(code, period)
    else:
        data = get_us_kline(code, period)

    if data:
        return {"status": "ok", "data": data}
    return {"status": "error", "message": "获取K线数据失败"}


@app.get("/api/comparison")
def get_comparison(
    code: str = Query(..., description="股票代码"),
    market: str = Query(..., description="市场: A股 / 美股"),
):
    if market == "A股":
        data = get_ashare_comparison(code)
    else:
        data = get_us_comparison(code)

    if data:
        return {"status": "ok", "data": data}
    return {"status": "error", "message": "获取同行对比数据失败"}


@app.get("/api/valuation")
def get_valuation(
    code: str = Query(..., description="股票代码"),
    market: str = Query(..., description="市场: A股 / 美股"),
):
    if market == "A股":
        data = get_ashare_valuation(code)
    else:
        data = get_us_valuation(code)

    if data:
        return {"status": "ok", "data": data}
    return {"status": "error", "message": "获取估值数据失败"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
