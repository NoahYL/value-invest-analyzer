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


def _safe_float(df, row_name, col):
    """安全地从 DataFrame 中读取一个浮点值"""
    try:
        if row_name in df.index:
            v = df.loc[row_name, col]
            if v is not None and str(v) != "nan":
                return float(v)
    except Exception:
        pass
    return None


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
        financials["currency"] = info.get("currency", "USD")

        # 年报数据（优先）+ 最新季报
        try:
            inc = ticker.income_stmt
            cf = ticker.cashflow
            if inc is not None and not inc.empty:
                col = inc.columns[0]
                fy_label = col.strftime("FY%Y")
                financials["revenue"] = _safe_float(inc, "Total Revenue", col)
                financials["net_profit"] = _safe_float(inc, "Net Income", col)
                financials["report_name"] = fy_label + "年报"
            if cf is not None and not cf.empty:
                col = cf.columns[0]
                financials["cashflow"] = _safe_float(cf, "Operating Cash Flow", col) or _safe_float(cf, "Cash Flow From Continuing Operating Activities", col)

            # 最新季报
            qinc = ticker.quarterly_income_stmt
            qcf = ticker.quarterly_cashflow
            if qinc is not None and not qinc.empty:
                qcol = qinc.columns[0]
                q_date = qcol.strftime("%Y Q") + str((qcol.month - 1) // 3 + 1)
                # 只有当季报比年报更新时才显示
                if inc is not None and not inc.empty and qcol > inc.columns[0]:
                    financials["latest_report_name"] = q_date
                    financials["latest_revenue"] = _safe_float(qinc, "Total Revenue", qcol)
                    financials["latest_net_profit"] = _safe_float(qinc, "Net Income", qcol)
                    if qcf is not None and not qcf.empty:
                        financials["latest_cashflow"] = _safe_float(qcf, "Operating Cash Flow", qcf.columns[0]) or _safe_float(qcf, "Cash Flow From Continuing Operating Activities", qcf.columns[0])
        except Exception as e:
            print(f"yfinance financial statements error for {symbol}: {e}")

        # 年报数据不完整时，回退到 info TTM 数据
        if not financials.get("revenue"):
            financials["revenue"] = info.get("totalRevenue")
            financials["net_profit"] = info.get("netIncomeToCommon")
            financials["cashflow"] = info.get("operatingCashflow")
            # 标注 TTM 截止季度
            from datetime import datetime
            mq = info.get("mostRecentQuarter")
            if mq:
                end = datetime.fromtimestamp(mq)
                financials["report_name"] = f"TTM 截至{end.year}年{end.month}月"
            else:
                financials["report_name"] = "TTM(近12个月)"
            # TTM 时季报也没意义，清掉
            financials.pop("latest_report_name", None)
            financials.pop("latest_revenue", None)
            financials.pop("latest_net_profit", None)
            financials.pop("latest_cashflow", None)

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
