"""
财务质量服务 - Phase 2

只使用已验证稳定的数据源：
- A股: Eastmoney RPT_F10_FINANCE_MAINFINADATA （年报主要指标表，支持15年历史）
- 美股: yfinance ticker.income_stmt / cashflow / balance_sheet （4-5年历史）

核心输出：
- history: 10年/5年关键指标序列（供趋势图使用）
- indicators: 当期扩展指标（毛利率/净利率/净利润含金量/资产负债率/FCF利润率）
- flags: 高置信度红旗（数据清晰、误报率低的）
"""

from curl_cffi import requests as cffi_requests

_DC_BASE = "https://datacenter.eastmoney.com/securities/api/data/v1/get"


def _fetch_ashare_shares(code: str) -> tuple[float | None, float | None]:
    """取 A 股总股本（股）+ 最新价"""
    try:
        import akshare as ak
        df = ak.stock_individual_info_em(symbol=code)
        info = {r["item"]: r["value"] for _, r in df.iterrows()}
        shares = float(info["总股本"]) if info.get("总股本") else None
        price = float(info["最新"]) if info.get("最新") else None
        return shares, price
    except Exception as e:
        print(f"Fetch ashare shares error for {code}: {e}")
        return None, None


# ============================================================
# A股
# ============================================================

def _get_exchange_prefix(code: str) -> str:
    if code.startswith(("6", "9")):
        return f"{code}.SH"
    return f"{code}.SZ"


def _fetch_ashare_annual(code: str, years: int = 12) -> list[dict]:
    """取 A股近 N 期年报的主要财务指标"""
    secucode = _get_exchange_prefix(code)
    params = {
        "reportName": "RPT_F10_FINANCE_MAINFINADATA",
        "columns": "REPORT_DATE_NAME,REPORT_DATE,REPORT_TYPE,TOTALOPERATEREVE,PARENTNETPROFIT,"
                   "NETCASH_OPERATE_PK,ROEJQ,XSMLL,XSJLL,EPSJB,BPS,LD",
        "filter": f'(SECUCODE="{secucode}")(REPORT_TYPE="年报")',
        "pageSize": str(years),
        "sortTypes": "-1",
        "sortColumns": "REPORT_DATE",
    }
    try:
        resp = cffi_requests.get(_DC_BASE, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        return items
    except Exception as e:
        print(f"Fetch ashare annual error for {code}: {e}")
        return []


def get_ashare_quality(code: str) -> dict | None:
    items = _fetch_ashare_annual(code, years=12)
    if not items:
        return None

    # 按时间升序（老→新）
    items = sorted(items, key=lambda x: x.get("REPORT_DATE", ""))

    history = []
    for it in items:
        rev = it.get("TOTALOPERATEREVE")
        np_ = it.get("PARENTNETPROFIT")
        ocf = it.get("NETCASH_OPERATE_PK")
        cash_quality = None
        if np_ and np_ != 0 and ocf is not None:
            cash_quality = round(ocf / np_ * 100, 1)
        year_label = (it.get("REPORT_DATE_NAME") or "").replace("年报", "")
        history.append({
            "year": year_label,
            "revenue": round(rev / 1e8, 2) if rev else None,      # 亿元
            "net_profit": round(np_ / 1e8, 2) if np_ else None,
            "ocf": round(ocf / 1e8, 2) if ocf else None,
            "roe": round(it["ROEJQ"], 2) if it.get("ROEJQ") is not None else None,
            "gross_margin": round(it["XSMLL"], 2) if it.get("XSMLL") is not None else None,
            "net_margin": round(it["XSJLL"], 2) if it.get("XSJLL") is not None else None,
            "cash_quality": cash_quality,         # 净利润含金量 = OCF/净利润 %
            "debt_ratio": round(it["LD"], 2) if it.get("LD") is not None else None,
        })

    # 最新期指标
    latest = history[-1] if history else {}
    indicators = {
        "gross_margin": latest.get("gross_margin"),
        "net_margin": latest.get("net_margin"),
        "cash_quality": latest.get("cash_quality"),
        "debt_ratio": latest.get("debt_ratio"),
        "roe": latest.get("roe"),
        "year": latest.get("year"),
        "currency": "CNY",
    }

    flags = _detect_flags(history)

    # --- DCF 基础数据 ---
    shares, price = _fetch_ashare_shares(code)
    latest_ocf = history[-1].get("ocf") if history else None  # 亿
    # A 股无稳定 CAPEX 接口，用 OCF×0.7 作保守 FCF 估算
    base_fcf = round(latest_ocf * 0.7, 2) if latest_ocf else None
    dcf_base = {
        "base_fcf": base_fcf,               # 单位：亿元
        "fcf_source": "OCF × 0.7（保守估算，A 股无稳定 CAPEX 数据源）",
        "shares_outstanding": round(shares / 1e8, 2) if shares else None,  # 亿股
        "current_price": price,
        "currency": "CNY",
    }

    return {
        "history": history,
        "indicators": indicators,
        "flags": flags,
        "dcf_base": dcf_base,
    }


# ============================================================
# 美股
# ============================================================

def _safe_num(df, row, col):
    try:
        if row in df.index:
            v = df.loc[row, col]
            if v is not None and str(v) != "nan":
                return float(v)
    except Exception:
        pass
    return None


def get_us_quality(symbol: str) -> dict | None:
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol.upper())
        inc = ticker.income_stmt
        cf = ticker.cashflow
        bs = ticker.balance_sheet
        if inc is None or inc.empty:
            return None

        info = ticker.info or {}
        currency = info.get("currency", "USD")

        # 按列（时间）从旧到新
        cols = sorted(inc.columns)
        history = []
        for col in cols:
            revenue = _safe_num(inc, "Total Revenue", col)
            net_income = _safe_num(inc, "Net Income", col)
            gross_profit = _safe_num(inc, "Gross Profit", col)

            # 现金流
            ocf = None
            fcf = None
            capex = None
            if cf is not None and not cf.empty and col in cf.columns:
                ocf = _safe_num(cf, "Operating Cash Flow", col) or \
                      _safe_num(cf, "Cash Flow From Continuing Operating Activities", col)
                fcf = _safe_num(cf, "Free Cash Flow", col)
                capex = _safe_num(cf, "Capital Expenditure", col)

            # 资产负债率
            debt_ratio = None
            if bs is not None and not bs.empty and col in bs.columns:
                total_liab = _safe_num(bs, "Total Liabilities Net Minority Interest", col)
                total_assets = _safe_num(bs, "Total Assets", col)
                if total_liab and total_assets and total_assets != 0:
                    debt_ratio = round(total_liab / total_assets * 100, 2)

            # 派生指标
            gross_margin = round(gross_profit / revenue * 100, 2) if (gross_profit and revenue) else None
            net_margin = round(net_income / revenue * 100, 2) if (net_income and revenue) else None
            fcf_margin = round(fcf / revenue * 100, 2) if (fcf and revenue) else None
            cash_quality = round(ocf / net_income * 100, 1) if (ocf and net_income and net_income != 0) else None

            # ROE = 净利润 / 股东权益
            roe = None
            if bs is not None and col in bs.columns and net_income:
                equity = _safe_num(bs, "Stockholders Equity", col) or \
                         _safe_num(bs, "Common Stock Equity", col)
                if equity and equity != 0:
                    roe = round(net_income / equity * 100, 2)

            # 跳过全空的年份（PDD 2025 的情况）
            if revenue is None and net_income is None:
                continue

            history.append({
                "year": str(col.year),
                "revenue": round(revenue / 1e8, 2) if revenue else None,      # 美股也换成"亿"单位，便于图表
                "net_profit": round(net_income / 1e8, 2) if net_income else None,
                "ocf": round(ocf / 1e8, 2) if ocf else None,
                "fcf": round(fcf / 1e8, 2) if fcf else None,
                "roe": roe,
                "gross_margin": gross_margin,
                "net_margin": net_margin,
                "fcf_margin": fcf_margin,
                "cash_quality": cash_quality,
                "debt_ratio": debt_ratio,
            })

        if not history:
            return None

        latest = history[-1]
        indicators = {
            "gross_margin": latest.get("gross_margin"),
            "net_margin": latest.get("net_margin"),
            "cash_quality": latest.get("cash_quality"),
            "debt_ratio": latest.get("debt_ratio"),
            "fcf_margin": latest.get("fcf_margin"),
            "roe": latest.get("roe"),
            "year": latest.get("year"),
            "currency": currency,
        }

        flags = _detect_flags(history)

        # --- DCF 基础数据 ---
        shares = info.get("sharesOutstanding")
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        latest_fcf = history[-1].get("fcf") if history else None  # 亿
        dcf_base = {
            "base_fcf": latest_fcf,
            "fcf_source": "yfinance 年报 Free Cash Flow（最新年）",
            "shares_outstanding": round(shares / 1e8, 2) if shares else None,  # 亿股
            "current_price": round(price, 2) if price else None,
            "currency": currency,
        }

        return {
            "history": history,
            "indicators": indicators,
            "flags": flags,
            "dcf_base": dcf_base,
        }
    except Exception as e:
        print(f"US quality error for {symbol}: {e}")
        return None


# ============================================================
# 财务红旗检测（只做高置信度的3个）
# ============================================================

def _detect_flags(history: list[dict]) -> list[dict]:
    """
    只做 3 个高置信度的红旗，误报率低：
    1. 净利润含金量 持续 < 70%（利润"纸面化"）
    2. 资产负债率 > 70%（非金融业过度杠杆 - 此处不区分金融股，提示"偏高"）
    3. 净利率连续 3 年下滑（生意恶化）
    """
    flags = []
    if not history:
        return flags

    # --- 1. 净利润含金量（看近 3 年平均）---
    recent = [h for h in history[-3:] if h.get("cash_quality") is not None]
    if len(recent) >= 2:
        avg = sum(h["cash_quality"] for h in recent) / len(recent)
        if avg < 70:
            flags.append({
                "level": "warning",
                "title": "利润含金量偏低",
                "desc": f"近{len(recent)}年平均净利润含金量（OCF/净利润）约 {avg:.0f}%，低于 70%。利润未能有效转为现金，需警惕应收账款膨胀或会计处理问题。",
            })

    # --- 2. 资产负债率 ---
    latest = history[-1]
    dr = latest.get("debt_ratio")
    if dr is not None and dr > 70:
        flags.append({
            "level": "warning",
            "title": "资产负债率偏高",
            "desc": f"最新资产负债率 {dr:.1f}%，高于 70%。金融/地产等行业属正常，其他行业需评估偿债压力。",
        })

    # --- 3. 净利率连续 3 年下滑 且 累计跌幅显著 (>=3 个百分点) ---
    recent_nm = [h["net_margin"] for h in history[-4:] if h.get("net_margin") is not None]
    if len(recent_nm) >= 4:
        last3 = recent_nm[-3:]
        all_decreasing = all(last3[i] < last3[i - 1] for i in (1, 2))
        total_drop = recent_nm[-3] - recent_nm[-1]
        if all_decreasing and total_drop >= 3:
            flags.append({
                "level": "warning",
                "title": "净利率持续显著下滑",
                "desc": f"近 3 年净利率 {recent_nm[-3]:.1f}% → {recent_nm[-2]:.1f}% → {recent_nm[-1]:.1f}%，累计下降 {total_drop:.1f} 个百分点，需审视赚钱能力是否结构性下降。",
            })

    return flags
