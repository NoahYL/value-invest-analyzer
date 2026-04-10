import akshare as ak
from curl_cffi import requests as cffi_requests

_DC_BASE = "https://datacenter.eastmoney.com/securities/api/data/v1/get"


def _get_exchange_prefix(code: str) -> str:
    """根据代码判断交易所前缀"""
    if code.startswith(("6", "9")):
        return f"{code}.SH"
    return f"{code}.SZ"


def _fetch_concepts(code: str) -> list[str]:
    """获取个股概念板块"""
    try:
        params = {
            "reportName": "RPT_F10_CORETHEME_BOARDTYPE",
            "columns": "BOARD_NAME",
            "filter": f'(SECURITY_CODE="{code}")',
            "pageSize": "50",
        }
        resp = cffi_requests.get(_DC_BASE, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        # 过滤掉通用性太强的标签
        skip = {"融资融券", "深股通", "沪股通", "小盘股", "中盘股", "大盘股", "深成500", "沪深300", "北交所概念", "转融券标的"}
        return [it["BOARD_NAME"] for it in items if it.get("BOARD_NAME") and it["BOARD_NAME"] not in skip]
    except Exception as e:
        print(f"Fetch concepts error for {code}: {e}")
        return []


def _fetch_revenue_breakdown(code: str) -> list[dict]:
    """获取最新一期主营构成（按产品）"""
    try:
        secucode = _get_exchange_prefix(code)
        params = {
            "reportName": "RPT_F10_FN_MAINOP",
            "columns": "ALL",
            "filter": f'(SECUCODE="{secucode}")(MAINOP_TYPE="2")',
            "pageNumber": "1",
            "pageSize": "20",
            "sortTypes": "-1,-1",
            "sortColumns": "REPORT_DATE,MBI_RATIO",
        }
        resp = cffi_requests.get(_DC_BASE, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        if not items:
            return []

        # 只取最新一期
        latest_date = items[0].get("REPORT_DATE", "")[:10]
        results = []
        for it in items:
            if it.get("REPORT_DATE", "")[:10] != latest_date:
                break
            income = it.get("MAIN_BUSINESS_INCOME") or 0
            ratio = it.get("MBI_RATIO") or 0
            gross_margin = it.get("GROSS_RPOFIT_RATIO") or 0
            results.append({
                "name": it.get("ITEM_NAME", ""),
                "income": round(income / 1e8, 2),       # 转为亿元
                "ratio": round(ratio * 100, 2),          # 转为百分比
                "gross_margin": round(gross_margin * 100, 2),
            })
        return results
    except Exception as e:
        print(f"Fetch revenue breakdown error for {code}: {e}")
        return []


def _fetch_financials(code: str) -> dict:
    """获取A股关键财务指标（PE/PB/ROE/营收/净利润/经营现金流）"""
    secucode = _get_exchange_prefix(code)
    result = {}

    # 1. 估值指标 PE / PB
    try:
        params = {
            "reportName": "RPT_VALUEANALYSIS_DET",
            "columns": "PE_TTM,PB_MRQ",
            "filter": f'(SECUCODE="{secucode}")',
            "pageSize": "1",
        }
        resp = cffi_requests.get(_DC_BASE, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        if items:
            result["pe"] = items[0].get("PE_TTM")
            result["pb"] = items[0].get("PB_MRQ")
    except Exception as e:
        print(f"Fetch valuation error for {code}: {e}")

    # 2. 财务指标 ROE / 营收 / 净利润 / 经营现金流
    try:
        params = {
            "reportName": "RPT_F10_FINANCE_MAINFINADATA",
            "columns": "REPORT_DATE_NAME,ROEJQ,TOTALOPERATEREVE,PARENTNETPROFIT,NETCASH_OPERATE_PK",
            "filter": f'(SECUCODE="{secucode}")',
            "pageSize": "1",
            "sortTypes": "-1",
            "sortColumns": "REPORT_DATE",
        }
        resp = cffi_requests.get(_DC_BASE, params=params, timeout=15, impersonate="chrome")
        data = resp.json()
        items = (data.get("result") or {}).get("data") or []
        if items:
            it = items[0]
            result["roe"] = it.get("ROEJQ")
            result["revenue"] = it.get("TOTALOPERATEREVE")
            result["net_profit"] = it.get("PARENTNETPROFIT")
            result["cashflow"] = it.get("NETCASH_OPERATE_PK")
            result["report_name"] = it.get("REPORT_DATE_NAME", "")
    except Exception as e:
        print(f"Fetch financials error for {code}: {e}")

    return result


def search_ashare_by_code(code: str) -> dict | None:
    """通过A股代码获取公司基本信息"""
    try:
        profile = ak.stock_profile_cninfo(symbol=code)
        if profile.empty:
            return None
        row = profile.iloc[0]

        concepts = _fetch_concepts(code)
        revenue = _fetch_revenue_breakdown(code)
        financials = _fetch_financials(code)

        return {
            "market": "A股",
            "code": code,
            "name": str(row.get("A股简称") or ""),
            "industry": str(row.get("所属行业") or ""),
            "business": str(row.get("主营业务") or ""),
            "concepts": concepts,
            "revenue": revenue,
            "financials": financials,
        }
    except Exception as e:
        print(f"AKShare query error for {code}: {e}")
        return None


def _query_eastmoney(name: str) -> list[dict]:
    """调用东方财富搜索接口，带重试"""
    url = "https://searchapi.eastmoney.com/api/suggest/get"
    params = {
        "input": name,
        "type": "14",
        "token": "D43BF722C8E33BDC906FB84D85E326E8",
        "count": "10",
    }
    last_err = None
    for attempt in range(3):
        try:
            resp = cffi_requests.get(
                url, params=params, timeout=15, impersonate="chrome",
            )
            data = resp.json()
            return data.get("QuotationCodeTable", {}).get("Data") or []
        except Exception as e:
            last_err = e
            print(f"eastmoney search attempt {attempt + 1} failed: {e}")
    print(f"eastmoney search all attempts failed: {last_err}")
    return []


def search_by_name(name: str) -> list[dict]:
    """通过公司名称模糊搜索股票（使用东方财富搜索接口，支持A股和美股）"""
    quote_list = _query_eastmoney(name)

    results = []
    for item in quote_list:
        code = item.get("Code", "")
        sec_type = item.get("SecurityTypeName", "")

        if sec_type == "美股":
            results.append({
                "market": "美股",
                "code": code,
                "name": item.get("Name", ""),
            })
        elif len(code) == 6 and code.isdigit():
            results.append({
                "market": "A股",
                "code": code,
                "name": item.get("Name", ""),
            })
    return results
