"""同行业对比服务"""

from curl_cffi import requests as cffi_requests

_DC_WEB = "https://datacenter-web.eastmoney.com/api/data/v1/get"
_DC_SEC = "https://datacenter.eastmoney.com/securities/api/data/v1/get"


def _get_exchange_prefix(code: str) -> str:
    if code.startswith(("6", "9")):
        return f"{code}.SH"
    return f"{code}.SZ"


def get_ashare_comparison(code: str):
    """A 股同行业对比"""

    # 1. 获取行业板块名称
    industry_board = _get_industry_board(code)
    if not industry_board:
        return None

    # 2. 获取同行业股票列表
    peer_codes = _get_peer_codes(industry_board)
    if not peer_codes or len(peer_codes) < 2:
        return None

    # 3. 批量查询估值数据 (PE/PB/PS/市值)
    valuation_map = _batch_valuation(peer_codes)

    # 4. 批量查询 ROE
    roe_map = _batch_roe(peer_codes)

    # 5. 组装结果
    peers = []
    for pc in peer_codes:
        val = valuation_map.get(pc, {})
        roe = roe_map.get(pc)
        name = val.get("name", pc)
        pe = val.get("pe")
        pb = val.get("pb")
        ps = val.get("ps")
        mcap = val.get("mcap")

        if not name or name == pc:
            continue

        peers.append({
            "code": pc,
            "name": name,
            "pe": round(pe, 2) if pe else None,
            "pb": round(pb, 2) if pb else None,
            "ps": round(ps, 2) if ps else None,
            "roe": round(roe, 2) if roe else None,
            "mcap": round(mcap / 1e8, 0) if mcap else None,
            "is_current": pc == code,
        })

    # 按市值降序
    peers.sort(key=lambda x: x.get("mcap") or 0, reverse=True)

    # 计算行业中位数
    def _median(values):
        v = sorted([x for x in values if x is not None])
        if not v:
            return None
        mid = len(v) // 2
        return v[mid] if len(v) % 2 else round((v[mid - 1] + v[mid]) / 2, 2)

    pe_list = [p["pe"] for p in peers]
    pb_list = [p["pb"] for p in peers]
    ps_list = [p["ps"] for p in peers]
    roe_list = [p["roe"] for p in peers]

    # 当前股票在行业中的位置
    current = next((p for p in peers if p["is_current"]), None)
    position = None
    if current and current["pe"] is not None:
        pe_median = _median(pe_list)
        if pe_median and pe_median > 0:
            ratio = current["pe"] / pe_median
            if ratio < 0.8:
                position = "偏低"
            elif ratio > 1.2:
                position = "偏高"
            else:
                position = "合理"

    return {
        "industry": industry_board,
        "peers": peers,
        "median": {
            "pe": _median(pe_list),
            "pb": _median(pb_list),
            "ps": _median(ps_list),
            "roe": _median(roe_list),
        },
        "position": position,
    }


def _get_industry_board(code: str) -> str | None:
    """获取股票的行业板块名称"""
    try:
        params = {
            "reportName": "RPT_WEB_RESPREDICT",
            "columns": "INDUSTRY_BOARD",
            "filter": f'(SECURITY_CODE="{code}")',
            "pageSize": "1",
            "source": "WEB",
        }
        resp = cffi_requests.get(_DC_WEB, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        if items:
            return items[0].get("INDUSTRY_BOARD")

        # 备选：从 RPT_VALUEANALYSIS_DET 获取
        params2 = {
            "reportName": "RPT_VALUEANALYSIS_DET",
            "columns": "BOARD_NAME",
            "filter": f'(SECURITY_CODE="{code}")',
            "sortColumns": "TRADE_DATE",
            "sortTypes": "-1",
            "pageSize": "1",
            "source": "WEB",
        }
        resp2 = cffi_requests.get(_DC_SEC, params=params2, timeout=15, impersonate="chrome")
        data2 = resp2.json()
        items2 = (data2.get("result") or {}).get("data") or []
        if items2:
            return items2[0].get("BOARD_NAME")
    except Exception as e:
        print(f"Get industry board error {code}: {e}")
    return None


def _get_peer_codes(industry_board: str) -> list[str]:
    """获取同行业股票代码列表"""
    try:
        params = {
            "reportName": "RPT_WEB_RESPREDICT",
            "columns": "SECURITY_CODE,SECURITY_NAME_ABBR",
            "filter": f'(INDUSTRY_BOARD="{industry_board}")',
            "pageSize": "20",
            "source": "WEB",
        }
        resp = cffi_requests.get(_DC_WEB, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        return [it["SECURITY_CODE"] for it in items if it.get("SECURITY_CODE")]
    except Exception as e:
        print(f"Get peer codes error: {e}")
        return []


def _batch_valuation(codes: list[str]) -> dict:
    """批量查询 PE/PB/PS/市值"""
    try:
        codes_filter = ",".join([f'"{c}"' for c in codes])
        params = {
            "reportName": "RPT_VALUEANALYSIS_DET",
            "columns": "SECURITY_CODE,SECURITY_NAME_ABBR,PE_TTM,PB_MRQ,PS_TTM,TOTAL_MARKET_CAP",
            "filter": f"(SECURITY_CODE in ({codes_filter}))",
            "sortColumns": "TRADE_DATE",
            "sortTypes": "-1",
            "pageSize": str(len(codes) * 2),
            "source": "WEB",
        }
        resp = cffi_requests.get(_DC_SEC, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        result = {}
        for it in items:
            c = it["SECURITY_CODE"]
            if c not in result:
                result[c] = {
                    "name": it.get("SECURITY_NAME_ABBR", ""),
                    "pe": it.get("PE_TTM"),
                    "pb": it.get("PB_MRQ"),
                    "ps": it.get("PS_TTM"),
                    "mcap": it.get("TOTAL_MARKET_CAP"),
                }
        return result
    except Exception as e:
        print(f"Batch valuation error: {e}")
        return {}


def _batch_roe(codes: list[str]) -> dict:
    """批量查询 ROE"""
    try:
        codes_filter = ",".join([f'"{c}"' for c in codes])
        params = {
            "reportName": "RPT_F10_FINANCE_MAINFINADATA",
            "columns": "SECURITY_CODE,ROEJQ",
            "filter": f"(SECURITY_CODE in ({codes_filter}))",
            "sortColumns": "REPORT_DATE",
            "sortTypes": "-1",
            "pageSize": str(len(codes) * 2),
        }
        resp = cffi_requests.get(_DC_SEC, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        result = {}
        for it in items:
            c = it["SECURITY_CODE"]
            if c not in result and it.get("ROEJQ") is not None:
                result[c] = it["ROEJQ"]
        return result
    except Exception as e:
        print(f"Batch ROE error: {e}")
        return {}


def get_us_comparison(symbol: str):
    """美股同行对比 — 基于 yfinance"""
    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol.upper())
        info = ticker.info or {}

        industry = info.get("industry", "")
        if not industry:
            return None

        # yfinance 没有直接获取同行列表的接口，
        # 但 Ticker 对象有 recommendations 等属性可用于发现相似公司
        # 这里用 sector + industry 信息 + 手工构造一些常见同行
        sector = info.get("sector", "")

        # 尝试从 yfinance 获取同行（部分版本支持）
        peer_symbols = []
        try:
            # yfinance 有些版本支持 .recommendations 或 peers
            import json
            raw = ticker._data.get("recommendationTrend", {})
            # 尝试获取相关公司
        except Exception:
            pass

        # 备选：使用 sector/industry 关键词，从预定义列表中查找
        # 这里用一个更可靠的方法：查找同 industry 的热门股票
        if not peer_symbols:
            peer_symbols = _get_us_peers(symbol.upper(), industry, sector)

        if len(peer_symbols) < 2:
            return None

        # 批量获取数据
        peers = []
        for sym in peer_symbols:
            try:
                t = yf.Ticker(sym)
                inf = t.info or {}
                pe = inf.get("trailingPE")
                pb = inf.get("priceToBook")
                ps = inf.get("priceToSalesTrailing12Months")
                roe = inf.get("returnOnEquity")
                mcap = inf.get("marketCap")

                peers.append({
                    "code": sym,
                    "name": inf.get("shortName", sym),
                    "pe": round(pe, 2) if pe else None,
                    "pb": round(pb, 2) if pb else None,
                    "ps": round(ps, 2) if ps else None,
                    "roe": round(roe * 100, 2) if roe else None,
                    "mcap": round(mcap / 1e8, 0) if mcap else None,
                    "is_current": sym == symbol.upper(),
                })
            except Exception as e:
                print(f"US peer fetch error {sym}: {e}")

        if len(peers) < 2:
            return None

        peers.sort(key=lambda x: x.get("mcap") or 0, reverse=True)

        def _median(values):
            v = sorted([x for x in values if x is not None])
            if not v:
                return None
            mid = len(v) // 2
            return v[mid] if len(v) % 2 else round((v[mid - 1] + v[mid]) / 2, 2)

        pe_list = [p["pe"] for p in peers]
        pb_list = [p["pb"] for p in peers]
        ps_list = [p["ps"] for p in peers]
        roe_list = [p["roe"] for p in peers]

        current = next((p for p in peers if p["is_current"]), None)
        position = None
        if current and current["pe"] is not None:
            pe_median = _median(pe_list)
            if pe_median and pe_median > 0:
                ratio = current["pe"] / pe_median
                if ratio < 0.8:
                    position = "偏低"
                elif ratio > 1.2:
                    position = "偏高"
                else:
                    position = "合理"

        return {
            "industry": industry,
            "peers": peers,
            "median": {
                "pe": _median(pe_list),
                "pb": _median(pb_list),
                "ps": _median(ps_list),
                "roe": _median(roe_list),
            },
            "position": position,
        }
    except Exception as e:
        print(f"US comparison error {symbol}: {e}")
        return None


# 美股行业同行映射表（常见行业的代表性公司）
_US_INDUSTRY_PEERS = {
    "Internet Retail": ["AMZN", "PDD", "JD", "BABA", "MELI", "SE", "CPNG", "EBAY", "ETSY", "W"],
    "Semiconductors": ["NVDA", "AMD", "INTC", "AVGO", "QCOM", "TXN", "MU", "MRVL", "KLAC", "LRCX"],
    "Software - Infrastructure": ["MSFT", "ORCL", "CRM", "NOW", "SNOW", "PLTR", "MDB", "NET", "DDOG", "ZS"],
    "Software - Application": ["ADBE", "INTU", "SHOP", "SQ", "WDAY", "HUBS", "ZM", "DOCU", "TEAM", "U"],
    "Consumer Electronics": ["AAPL", "SONY", "SSNLF", "XIACF", "HPQ", "DELL", "LOGI", "GPRO", "HEAR", "KOSS"],
    "Internet Content & Information": ["GOOGL", "META", "BIDU", "SNAP", "PINS", "RDDT", "TME", "WB", "ZG", "IAC"],
    "Auto Manufacturers": ["TSLA", "TM", "GM", "F", "STLA", "HMC", "NIO", "LI", "XPEV", "RIVN"],
    "Drug Manufacturers - General": ["LLY", "JNJ", "NVS", "PFE", "MRK", "ABBV", "AZN", "BMY", "AMGN", "GSK"],
    "Banks - Diversified": ["JPM", "BAC", "WFC", "C", "GS", "MS", "HSBC", "RY", "TD", "USB"],
    "Discount Stores": ["WMT", "COST", "TGT", "DG", "DLTR", "BJ", "PSMT", "IMKTA", "OLLI", "FIVE"],
    "Restaurants": ["MCD", "SBUX", "CMG", "YUM", "QSR", "DPZ", "WING", "SHAK", "DNUT", "JACK"],
    "Entertainment": ["DIS", "NFLX", "CMCSA", "WBD", "PARA", "LGF.A", "IMAX", "LULU", "AMC", "CNK"],
    "Aerospace & Defense": ["BA", "LMT", "RTX", "NOC", "GD", "TDG", "HWM", "LHX", "HII", "TXT"],
    "Oil & Gas Integrated": ["XOM", "CVX", "SHEL", "TTE", "COP", "BP", "ENB", "SLB", "EOG", "PXD"],
    "Communication Equipment": ["CSCO", "MSI", "JNPR", "ERIC", "NOK", "UI", "COMM", "VIAV", "CALX", "LITE"],
    "Specialty Retail": ["HD", "LOW", "TJX", "ROST", "BBY", "TSCO", "WSM", "RH", "ULTA", "GAP"],
}


def _get_us_peers(symbol: str, industry: str, sector: str) -> list[str]:
    """获取美股同行列表"""
    # 先从预定义映射中查找
    if industry in _US_INDUSTRY_PEERS:
        peers = _US_INDUSTRY_PEERS[industry]
        if symbol not in peers:
            peers = [symbol] + peers[:9]
        return peers[:10]

    # 模糊匹配行业名
    industry_lower = industry.lower()
    for key, peers in _US_INDUSTRY_PEERS.items():
        if any(word in industry_lower for word in key.lower().split()):
            result = list(peers)
            if symbol not in result:
                result = [symbol] + result[:9]
            return result[:10]

    # 都匹配不到，返回空
    return [symbol]
