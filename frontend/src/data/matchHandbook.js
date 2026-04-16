import industries from "./industries.json";

/** 全局共享的版块保质期元数据（tier / label / hint） */
export const SECTION_META = industries?.sectionMeta || {};

/**
 * 按股票代码精准匹配，fallback 到行业关键词匹配。
 * @param {string} code   股票代码 (A股6位 或 美股 ticker)
 * @param {string} industry  后端返回的 industry 字段
 * @returns {object|null} 匹配到的手册；未匹配返回 null
 */
export function matchHandbook(code, industry) {
  if (!industries || !industries.handbooks) return null;
  const codeUpper = (code || "").toUpperCase();

  // 1. 精准代码匹配（最高优先级）
  for (const hb of industries.handbooks) {
    const codes = (hb.match?.codes || []).map((c) => c.toUpperCase());
    if (codes.includes(codeUpper)) {
      return { ...hb, matchType: "code" };
    }
  }

  // 2. 行业关键词 fallback
  if (industry) {
    for (const hb of industries.handbooks) {
      const keywords = hb.match?.industryKeywords || [];
      if (keywords.some((kw) => industry.includes(kw))) {
        return { ...hb, matchType: "industry" };
      }
    }
  }

  return null;
}
