"""
Benchmark 自动校准服务

给定一组同行股票代码，抓取最新年报数据，计算关键指标的 P25/P50/P75 分位数。
用于行业手册里「财务 Benchmark」版块的自动校准 —— 对比写死的经验阈值与真实同行分布。

支持代码格式：
- A股：6 位数字（如 603993、601899）
- 美股：纯字母（如 NVDA、COIN）
- 其它（HK / LSE / 异常代码）：静默跳过

目标指标（4 个跨市场可对齐的）：
- gross_margin   毛利率
- net_margin     净利率
- roe            ROE
- debt_ratio     资产负债率
"""

import re
from curl_cffi import requests as cffi_requests

_DC_BASE = "https://datacenter.eastmoney.com/securities/api/data/v1/get"

_METRIC_KEYS = ["gross_margin", "net_margin", "roe", "debt_ratio"]
_METRIC_LABELS = {
    "gross_margin": "毛利率",
    "net_margin": "净利率",
    "roe": "ROE",
    "debt_ratio": "资产负债率",
}


def _classify(code: str) -> str:
    """识别代码归属：a_share / us_stock / other"""
    c = (code or "").strip()
    if re.match(r"^\d{6}$", c):
        return "a_share"
    if re.match(r"^[A-Za-z]+$", c):
        return "us_stock"
    return "other"


def _exchange_prefix(code: str) -> str:
    if code.startswith(("6", "9")):
        return f"{code}.SH"
    return f"{code}.SZ"


def _quantile(sorted_vals: list[float], q: float) -> float | None:
    """线性插值分位数。sorted_vals 已排序且非空。"""
    if not sorted_vals:
        return None
    n = len(sorted_vals)
    if n == 1:
        return round(sorted_vals[0], 2)
    idx = (n - 1) * q
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    frac = idx - lo
    v = sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac
    return round(v, 2)


# ============================================================
# A股：一次批量取多家公司的最新年报主要指标
# ============================================================

def _fetch_ashare_batch(codes: list[str]) -> dict[str, dict]:
    """
    批量抓 A 股最新年报主要指标。
    返回 {code: {name, gross_margin, net_margin, roe, debt_ratio, report_date}}
    """
    if not codes:
        return {}

    secucodes = ",".join([f'"{_exchange_prefix(c)}"' for c in codes])
    params = {
        "reportName": "RPT_F10_FINANCE_MAINFINADATA",
        "columns": "SECURITY_CODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_DATE_NAME,REPORT_TYPE,"
                   "XSMLL,XSJLL,ROEJQ,LD",
        "filter": f'(SECUCODE in ({secucodes}))(REPORT_TYPE="年报")',
        "pageSize": str(len(codes) * 3),  # 每家最多取几期保底
        "sortTypes": "-1",
        "sortColumns": "REPORT_DATE",
    }

    try:
        resp = cffi_requests.get(_DC_BASE, params=params, timeout=15, impersonate="chrome")
        items = (resp.json().get("result") or {}).get("data") or []
    except Exception as e:
        print(f"Benchmark batch A股 error: {e}")
        return {}

    # 每家只取最新一期
    result: dict[str, dict] = {}
    for it in items:
        code = it.get("SECURITY_CODE")
        if not code or code in result:
            continue
        result[code] = {
            "name": it.get("SECURITY_NAME_ABBR") or code,
            "gross_margin": it.get("XSMLL"),
            "net_margin": it.get("XSJLL"),
            "roe": it.get("ROEJQ"),
            "debt_ratio": it.get("LD"),
            "report_date_name": it.get("REPORT_DATE_NAME") or "",
        }
    return result


# ============================================================
# 美股：循环 yfinance（没有批量接口）
# ============================================================

def _fetch_us_single(symbol: str) -> dict | None:
    try:
        import yfinance as yf
        t = yf.Ticker(symbol.upper())
        info = t.info or {}
        if not info.get("quoteType"):
            return None

        gm = info.get("grossMargins")
        nm = info.get("profitMargins")
        roe = info.get("returnOnEquity")
        # debtToEquity 单位是百分比（如 120 表示 120%），
        # 推算资产负债率 ≈ D / (D + E) = (d/100) / (1 + d/100)
        dte = info.get("debtToEquity")
        debt_ratio = None
        if dte is not None:
            ratio = dte / 100.0
            debt_ratio = ratio / (1 + ratio) * 100

        return {
            "name": info.get("shortName") or symbol,
            # yfinance 小数（0.35 = 35%），统一放大为百分比
            "gross_margin": gm * 100 if gm is not None else None,
            "net_margin": nm * 100 if nm is not None else None,
            "roe": roe * 100 if roe is not None else None,
            "debt_ratio": debt_ratio,
            "report_date_name": "TTM",
        }
    except Exception as e:
        print(f"Benchmark US fetch error {symbol}: {e}")
        return None


# ============================================================
# 主入口：聚合 + 分位数
# ============================================================

def get_benchmark_calibration(peer_codes: list[str]) -> dict:
    """
    输入：同行代码列表（可跨市场）
    输出：分位数 + 原始样本 + 跳过清单
    """
    if not peer_codes:
        return {
            "peers_used": [],
            "peers_skipped": [],
            "metrics": {k: None for k in _METRIC_KEYS},
            "asOf": None,
        }

    # 1. 按市场分组
    ashare_codes, us_codes, skipped = [], [], []
    for c in peer_codes:
        m = _classify(c)
        if m == "a_share":
            ashare_codes.append(c)
        elif m == "us_stock":
            us_codes.append(c)
        else:
            skipped.append({"code": c, "reason": "非 A股/美股（HK / LSE 等暂不支持）"})

    # 2. 批量抓数据
    a_data = _fetch_ashare_batch(ashare_codes) if ashare_codes else {}
    us_data: dict[str, dict] = {}
    for sym in us_codes:
        d = _fetch_us_single(sym)
        if d:
            us_data[sym.upper()] = d
        else:
            skipped.append({"code": sym, "reason": "yfinance 未返回数据"})

    # A 股无数据也记上
    for c in ashare_codes:
        if c not in a_data:
            skipped.append({"code": c, "reason": "Eastmoney 无最新年报"})

    # 3. 聚合每个指标的样本
    peers_used = []
    samples_by_metric: dict[str, list[dict]] = {k: [] for k in _METRIC_KEYS}
    latest_as_of = ""

    for code, d in list(a_data.items()) + list(us_data.items()):
        market_tag = "A股" if code in a_data else "美股"
        peers_used.append({
            "code": code,
            "name": d["name"],
            "market": market_tag,
        })
        if d.get("report_date_name") and d["report_date_name"] > latest_as_of:
            latest_as_of = d["report_date_name"]

        for k in _METRIC_KEYS:
            v = d.get(k)
            if v is None:
                continue
            try:
                fv = float(v)
            except (TypeError, ValueError):
                continue
            samples_by_metric[k].append({
                "code": code,
                "name": d["name"],
                "value": round(fv, 2),
            })

    # 4. 计算分位数（N >= 3 才有意义）
    metrics = {}
    for k in _METRIC_KEYS:
        samples = samples_by_metric[k]
        n = len(samples)
        if n < 3:
            metrics[k] = {
                "p25": None, "p50": None, "p75": None, "p90": None,
                "n": n, "samples": samples, "label": _METRIC_LABELS[k],
                "insufficient": True,
            }
            continue
        sorted_vals = sorted(s["value"] for s in samples)
        metrics[k] = {
            "p25": _quantile(sorted_vals, 0.25),
            "p50": _quantile(sorted_vals, 0.50),
            "p75": _quantile(sorted_vals, 0.75),
            "p90": _quantile(sorted_vals, 0.90),
            "n": n,
            "samples": sorted(samples, key=lambda s: -s["value"]),
            "label": _METRIC_LABELS[k],
            "insufficient": False,
        }

    return {
        "peers_used": peers_used,
        "peers_skipped": skipped,
        "metrics": metrics,
        "asOf": latest_as_of or None,
    }
