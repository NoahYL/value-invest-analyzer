"""行情数据服务：实时报价 + 历史K线"""

from datetime import datetime, timedelta
from curl_cffi import requests as cffi_requests
import yfinance as yf


# ────────────────── 工具函数 ──────────────────

def _secid(code: str) -> str:
    """A股代码转东方财富 secid"""
    if code.startswith(("6", "9")):
        return f"1.{code}"   # 上交所
    return f"0.{code}"       # 深交所


def _market_prefix(code: str) -> str:
    """A股代码转腾讯接口前缀"""
    if code.startswith(("6", "9")):
        return f"sh{code}"
    return f"sz{code}"


def _calc_date_range(period: str) -> tuple[str, str]:
    end = datetime.now()
    if period == "3m":
        start = end - timedelta(days=90)
    elif period == "6m":
        start = end - timedelta(days=180)
    else:
        start = end - timedelta(days=365)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


# ────────────────── 实时报价 ──────────────────

def get_ashare_quote(code: str) -> dict | None:
    """A股实时报价（腾讯财经接口）"""
    try:
        prefix = _market_prefix(code)
        url = f"https://qt.gtimg.cn/q={prefix}"
        resp = cffi_requests.get(url, timeout=10, impersonate="chrome")
        text = resp.text
        # 格式: v_sz000682="51~东方电子~000682~最新价~昨收~今开~成交量~...~最高~最低~..."
        # 按 ~ 分割, 索引: 3=最新价, 4=昨收, 5=今开, 6=成交量, 31=涨跌额, 32=涨跌幅, 33=最高, 34=最低
        content = text.split('"')[1] if '"' in text else ""
        fields = content.split("~")
        if len(fields) < 35:
            return None

        price = float(fields[3])
        prev_close = float(fields[4])
        change = float(fields[31])
        change_pct = float(fields[32])

        return {
            "price": price,
            "change": change,
            "change_pct": change_pct,
            "open": float(fields[5]),
            "high": float(fields[33]),
            "low": float(fields[34]),
            "prev_close": prev_close,
            "volume": int(fields[6]),
            "currency": "CNY",
        }
    except Exception as e:
        print(f"A-share quote error for {code}: {e}")
        return None


def get_us_quote(symbol: str) -> dict | None:
    """美股实时报价"""
    try:
        ticker = yf.Ticker(symbol.upper())
        fi = ticker.fast_info
        price = fi.last_price
        prev = fi.previous_close
        change = price - prev if price and prev else 0
        change_pct = (change / prev * 100) if prev else 0
        return {
            "price": round(price, 2) if price else 0,
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "open": round(fi.open, 2) if fi.open else 0,
            "high": round(fi.day_high, 2) if fi.day_high else 0,
            "low": round(fi.day_low, 2) if fi.day_low else 0,
            "prev_close": round(prev, 2) if prev else 0,
            "volume": fi.last_volume or 0,
            "currency": fi.currency or "USD",
        }
    except Exception as e:
        print(f"US quote error for {symbol}: {e}")
        return None


# ────────────────── 历史K线 ──────────────────

def get_ashare_kline(code: str, period: str = "3m") -> list[dict]:
    """A股日K线（腾讯财经接口，前复权）"""
    try:
        start, end = _calc_date_range(period)
        prefix = _market_prefix(code)
        # 腾讯接口: 最多返回 count 条
        count = {"3m": 100, "6m": 150, "1y": 300}.get(period, 100)
        url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
        params = {"param": f"{prefix},day,{start},{end},{count},qfq"}

        last_err = None
        for attempt in range(3):
            try:
                resp = cffi_requests.get(url, params=params, timeout=15, impersonate="chrome")
                data = resp.json().get("data", {}).get(prefix, {})
                klines = data.get("qfqday") or data.get("day") or []
                if klines:
                    break
            except Exception as e:
                last_err = e
                print(f"A-share kline attempt {attempt + 1} failed: {e}")
        else:
            if last_err:
                raise last_err
            return []

        records = []
        for k in klines:
            # [日期, 开盘, 收盘, 最高, 最低, 成交量]
            records.append({
                "date": k[0],
                "open": float(k[1]),
                "close": float(k[2]),
                "high": float(k[3]),
                "low": float(k[4]),
                "volume": int(float(k[5])),
            })
        return records
    except Exception as e:
        print(f"A-share kline error for {code}: {e}")
        return []


def get_us_kline(symbol: str, period: str = "3m") -> list[dict]:
    """美股日K线"""
    try:
        import math
        start, end = _calc_date_range(period)
        ticker = yf.Ticker(symbol.upper())
        df = ticker.history(start=start, end=end)
        if df.empty:
            return []
        records = []
        for date, row in df.iterrows():
            o, c, h, l, v = row["Open"], row["Close"], row["High"], row["Low"], row["Volume"]
            # 跳过含 NaN 的行
            if any(math.isnan(x) for x in [o, c, h, l]):
                continue
            records.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": round(float(o), 2),
                "close": round(float(c), 2),
                "high": round(float(h), 2),
                "low": round(float(l), 2),
                "volume": int(v) if not math.isnan(v) else 0,
            })
        return records
    except Exception as e:
        print(f"US kline error for {symbol}: {e}")
        return []
