"""估值分析服务 — 机构预测、PEG、格雷厄姆公式"""

import math
import yfinance as yf
from curl_cffi import requests as cffi_requests
from deep_translator import GoogleTranslator

_DC_BASE = "https://datacenter-web.eastmoney.com/api/data/v1/get"

# ---------------------------------------------------------------------------
# A 股估值
# ---------------------------------------------------------------------------

def _ashare_consensus(code: str) -> dict | None:
    """东方财富：机构一致预期（盈利预测汇总）"""
    try:
        params = {
            "reportName": "RPT_WEB_RESPREDICT",
            "columns": "ALL",
            "filter": f'(SECURITY_CODE="{code}")',
            "pageSize": "1",
            "source": "WEB",
        }
        resp = cffi_requests.get(_DC_BASE, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        if not items:
            return None

        it = items[0]

        # EPS 预测：YEAR1(A实际), YEAR2-4(E预测)
        forecasts = []
        for i in range(1, 5):
            year = it.get(f"YEAR{i}")
            eps = it.get(f"EPS{i}")
            mark = it.get(f"YEAR_MARK{i}", "")  # A=实际, E=预测
            if year and eps:
                forecasts.append({
                    "year": str(year),
                    "eps": round(eps, 2),
                    "type": "实际" if mark == "A" else "预测",
                })

        # 目标价范围
        tp_min = it.get("DEC_AIMPRICEMIN")
        tp_max = it.get("DEC_AIMPRICEMAX")
        target_price = round((tp_min + tp_max) / 2, 2) if tp_min and tp_max else None

        # 评级
        total_orgs = it.get("RATING_ORG_NUM") or 0
        buy_count = (it.get("RATING_BUY_NUM") or 0) + (it.get("RATING_ADD_NUM") or 0)
        hold_count = it.get("RATING_NEUTRAL_NUM") or 0
        sell_count = (it.get("RATING_REDUCE_NUM") or 0) + (it.get("RATING_SALE_NUM") or 0)

        return {
            "forecasts": forecasts,
            "target_price": target_price,
            "target_low": round(tp_min, 2) if tp_min else None,
            "target_high": round(tp_max, 2) if tp_max else None,
            "analyst_count": total_orgs,
            "buy": buy_count,
            "hold": hold_count,
            "sell": sell_count,
        }
    except Exception as e:
        print(f"Consensus error {code}: {e}")
        return None


def _ashare_growth_rate(consensus: dict | None) -> float | None:
    """从一致预期 EPS 推算年化增长率"""
    if not consensus:
        return None
    eps_list = [
        (f["year"], f["eps"])
        for f in consensus.get("forecasts", [])
        if f.get("eps") and f["eps"] > 0
    ]
    if len(eps_list) < 2:
        return None
    # 用首尾年份的 EPS 计算 CAGR
    eps_list.sort()
    y0, e0 = eps_list[0]
    yn, en = eps_list[-1]
    years = int(yn) - int(y0)
    if years <= 0 or e0 <= 0:
        return None
    cagr = ((en / e0) ** (1.0 / years) - 1) * 100
    return round(cagr, 2)


def get_ashare_valuation(code: str, current_price: float | None = None,
                         pe: float | None = None, eps: float | None = None):
    """A 股综合估值"""

    # 如果没传入当前价，尝试从腾讯行情获取
    if current_price is None:
        try:
            from services.market_service import get_ashare_quote
            q = get_ashare_quote(code)
            if q:
                current_price = q.get("price")
        except:
            pass

    # 如果没传入 PE / EPS，尝试获取
    if pe is None or eps is None:
        try:
            from services.ashare_service import _fetch_financials
            fin = _fetch_financials(code)
            if fin:
                pe = pe or fin.get("pe")
                if current_price and pe and pe > 0:
                    eps = eps or round(current_price / pe, 2)
        except:
            pass

    consensus = _ashare_consensus(code)
    growth = _ashare_growth_rate(consensus)

    result = {"methods": []}

    # ---- 1. 机构一致预期 ----
    if consensus and consensus.get("analyst_count", 0) > 0:
        target = consensus.get("target_price")
        upside = None
        if target and current_price and current_price > 0:
            upside = round((target - current_price) / current_price * 100, 2)
        result["methods"].append({
            "name": "机构一致预期",
            "target_price": target,
            "target_low": consensus.get("target_low"),
            "target_high": consensus.get("target_high"),
            "current_price": current_price,
            "upside": upside,
            "analyst_count": consensus["analyst_count"],
            "buy": consensus["buy"],
            "hold": consensus["hold"],
            "sell": consensus["sell"],
            "forecasts": consensus.get("forecasts", []),
        })

    # ---- 2. PEG 估值 ----
    if pe and growth and growth > 0:
        peg = round(pe / growth, 2)
        # PEG 合理价格 = 当前价 / PEG (PEG=1 为合理)
        fair_price = round(current_price / peg, 2) if current_price else None
        result["methods"].append({
            "name": "PEG估值",
            "pe": round(pe, 2),
            "growth": growth,
            "peg": peg,
            "fair_price": fair_price,
            "signal": "低估" if peg < 1 else ("合理" if peg <= 1.5 else "偏高"),
        })

    # ---- 3. 格雷厄姆估值 ----
    if eps and eps > 0 and growth is not None:
        # V = EPS × (8.5 + 2g) × 4.4 / Y
        # 用当前中国十年期国债利率约 1.7%，取 Y=4.0 做保守估算
        bond_yield = 4.0
        g = max(growth, 0)  # 负增长按 0 算
        graham_value = eps * (8.5 + 2 * g) * 4.4 / bond_yield
        graham_value = round(graham_value, 2)
        margin = None
        if current_price and current_price > 0:
            margin = round((graham_value - current_price) / current_price * 100, 2)
        result["methods"].append({
            "name": "格雷厄姆估值",
            "intrinsic_value": graham_value,
            "current_price": current_price,
            "margin_of_safety": margin,
            "eps": eps,
            "growth": g,
            "signal": "低估" if margin and margin > 30 else ("合理" if margin and margin > 0 else "偏高"),
        })

    # ---- 综合评分 ----
    result["score"] = _compute_score(result["methods"], current_price)
    return result


# ---------------------------------------------------------------------------
# 美股估值
# ---------------------------------------------------------------------------

def get_us_valuation(symbol: str):
    """美股综合估值"""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
    except Exception as e:
        print(f"yfinance error {symbol}: {e}")
        return {"methods": [], "score": None}

    current_price = info.get("currentPrice") or info.get("regularMarketPrice")
    trailing_pe = info.get("trailingPE")
    forward_pe = info.get("forwardPE")
    peg = info.get("pegRatio")
    trailing_eps = info.get("trailingEps")

    result = {"methods": []}
    translator = GoogleTranslator(source="en", target="zh-CN")

    # ---- 1. 机构一致预期 ----
    try:
        targets = ticker.analyst_price_targets
        if targets is not None:
            # Could be dict or DataFrame
            if hasattr(targets, "to_dict"):
                t = targets.to_dict()
            elif isinstance(targets, dict):
                t = targets
            else:
                t = {}

            mean_t = t.get("mean") or t.get("Mean")
            low_t = t.get("low") or t.get("Low")
            high_t = t.get("high") or t.get("High")

            upside = None
            if mean_t and current_price and current_price > 0:
                upside = round((mean_t - current_price) / current_price * 100, 2)

            # 评级分布
            buy, hold, sell = 0, 0, 0
            try:
                rec = ticker.recommendations_summary
                if rec is not None and not rec.empty:
                    row = rec.iloc[0]
                    buy = int(row.get("strongBuy", 0)) + int(row.get("buy", 0))
                    hold = int(row.get("hold", 0))
                    sell = int(row.get("sell", 0)) + int(row.get("strongSell", 0))
            except:
                pass

            analyst_count = buy + hold + sell

            result["methods"].append({
                "name": "机构一致预期",
                "target_price": round(mean_t, 2) if mean_t else None,
                "target_low": round(low_t, 2) if low_t else None,
                "target_high": round(high_t, 2) if high_t else None,
                "current_price": round(current_price, 2) if current_price else None,
                "upside": upside,
                "analyst_count": analyst_count,
                "buy": buy,
                "hold": hold,
                "sell": sell,
                "currency": info.get("currency", "USD"),
            })
    except Exception as e:
        print(f"US analyst targets error {symbol}: {e}")

    # ---- 2. PEG 估值 ----
    pe_used = forward_pe or trailing_pe
    if pe_used and peg:
        growth_rate = round(pe_used / peg, 2) if peg != 0 else None
        fair_price = round(current_price / peg, 2) if current_price and peg > 0 else None
        result["methods"].append({
            "name": "PEG估值",
            "pe": round(pe_used, 2),
            "growth": growth_rate,
            "peg": round(peg, 2),
            "fair_price": fair_price,
            "signal": "低估" if peg < 1 else ("合理" if peg <= 1.5 else "偏高"),
        })

    # ---- 3. 格雷厄姆估值 ----
    growth_for_graham = None
    if peg and pe_used:
        growth_for_graham = pe_used / peg if peg != 0 else None
    elif info.get("earningsGrowth"):
        growth_for_graham = info["earningsGrowth"] * 100

    if trailing_eps and trailing_eps > 0 and growth_for_graham is not None:
        bond_yield = 4.5  # 美国 10 年期国债利率约 4.5%
        g = max(growth_for_graham, 0)
        graham_value = trailing_eps * (8.5 + 2 * g) * 4.4 / bond_yield
        graham_value = round(graham_value, 2)
        margin = None
        if current_price and current_price > 0:
            margin = round((graham_value - current_price) / current_price * 100, 2)
        result["methods"].append({
            "name": "格雷厄姆估值",
            "intrinsic_value": graham_value,
            "current_price": round(current_price, 2) if current_price else None,
            "margin_of_safety": margin,
            "eps": round(trailing_eps, 2),
            "growth": round(g, 2),
            "signal": "低估" if margin and margin > 30 else ("合理" if margin and margin > 0 else "偏高"),
            "currency": info.get("currency", "USD"),
        })

    # 翻译信号文字已经是中文，无需翻译

    result["score"] = _compute_score(result["methods"], current_price)
    return result


# ---------------------------------------------------------------------------
# 综合评分
# ---------------------------------------------------------------------------

def _compute_score(methods: list, current_price: float | None) -> dict | None:
    """根据各估值方法生成 0-100 综合评分"""
    if not methods or not current_price:
        return None

    scores = []
    for m in methods:
        name = m["name"]
        if name == "机构一致预期":
            upside = m.get("upside")
            if upside is not None:
                # 上涨空间 >30% → 90分, 0% → 50分, <-20% → 20分
                s = min(max(50 + upside * 1.3, 10), 95)
                scores.append(("analyst", s, 0.35))
        elif name == "PEG估值":
            peg = m.get("peg")
            if peg is not None and peg > 0:
                # PEG=0.5 → 90, PEG=1 → 65, PEG=2 → 30
                s = min(max(90 - (peg - 0.5) * 40, 10), 95)
                scores.append(("peg", s, 0.30))
        elif name == "格雷厄姆估值":
            margin = m.get("margin_of_safety")
            if margin is not None:
                # 安全边际 50% → 90, 0% → 50, -30% → 20
                s = min(max(50 + margin * 0.8, 10), 95)
                scores.append(("graham", s, 0.35))

    if not scores:
        return None

    total_weight = sum(w for _, _, w in scores)
    weighted = sum(s * w for _, s, w in scores) / total_weight
    final = round(weighted)

    if final >= 70:
        label = "低估"
        color = "green"
    elif final >= 45:
        label = "合理"
        color = "orange"
    else:
        label = "偏高"
        color = "red"

    return {
        "value": final,
        "label": label,
        "color": color,
    }
