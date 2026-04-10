import yfinance as yf
from deep_translator import GoogleTranslator


def _translate(text: str) -> str:
    """翻译英文到中文，失败时返回原文"""
    if not text:
        return ""
    try:
        return GoogleTranslator(source='en', target='zh-CN').translate(text)
    except Exception:
        return text


def search_us_stock(symbol: str) -> dict | None:
    """通过美股代码获取公司基本信息"""
    try:
        ticker = yf.Ticker(symbol.upper())
        info = ticker.info

        if not info or info.get("quoteType") is None:
            return None

        industry = info.get("industry", "")
        business = info.get("longBusinessSummary", "")

        # 合并翻译，减少 API 调用次数
        separator = " ||| "
        combined = f"{industry}{separator}{business}"
        try:
            translated = GoogleTranslator(source='en', target='zh-CN').translate(combined)
            parts = translated.split("|||")
            if len(parts) == 2:
                industry = parts[0].strip()
                business = parts[1].strip()
            else:
                industry = _translate(industry)
                business = _translate(business)
        except Exception:
            pass

        # 财务指标
        financials = {}
        financials["pe"] = info.get("trailingPE")
        financials["pb"] = info.get("priceToBook")
        roe = info.get("returnOnEquity")
        financials["roe"] = round(roe * 100, 2) if roe is not None else None
        financials["revenue"] = info.get("totalRevenue")
        financials["net_profit"] = info.get("netIncomeToCommon")
        financials["cashflow"] = info.get("operatingCashflow")
        financials["currency"] = info.get("currency", "USD")

        return {
            "market": "美股",
            "code": symbol.upper(),
            "name": info.get("longName") or info.get("shortName", ""),
            "industry": industry,
            "business": business,
            "concepts": [],
            "revenue": [],
            "financials": financials,
        }
    except Exception as e:
        print(f"yfinance query error for {symbol}: {e}")
        return None
