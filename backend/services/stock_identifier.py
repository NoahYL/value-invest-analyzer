import re


def identify_market(query: str) -> str:
    """
    识别输入的是A股还是美股。
    A股代码：纯数字6位（如 600519、000001、300750、688981）
    美股代码：纯英文字母（如 AAPL、PDD、TSLA）
    """
    query = query.strip()

    # 纯数字且为6位 -> A股
    if re.match(r"^\d{6}$", query):
        return "a_share"

    # 纯英文字母 -> 美股
    if re.match(r"^[A-Za-z]+$", query):
        return "us_stock"

    # 包含中文 -> 尝试当作A股公司名搜索
    if re.search(r"[\u4e00-\u9fff]", query):
        return "a_share_name"

    return "unknown"
