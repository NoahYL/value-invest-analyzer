import specialCards from "./specialCards.json";

/**
 * 按股票代码匹配特殊资产卡片。
 * 特殊资产 = 传统 PE/DCF 不适用的标的：
 *   - 代理资产（MSTR 之于 BTC）
 *   - 杠杆 ETF（TQQQ / SQQQ / UPRO / SOXL）
 *   - 未来可扩展：SPAC / 空壳 / 深度周期股
 *
 * @param {string} code 股票代码（ticker）
 * @returns {object|null} 匹配到的卡片配置；未匹配返回 null
 */
export function matchSpecialCard(code) {
  if (!specialCards || !specialCards.cards) return null;
  const codeUpper = (code || "").toUpperCase();

  for (const card of specialCards.cards) {
    const codes = (card.match?.codes || []).map((c) => c.toUpperCase());
    if (codes.includes(codeUpper)) {
      return card;
    }
  }
  return null;
}
