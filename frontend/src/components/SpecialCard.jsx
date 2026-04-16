import { useState } from "react";
import { matchSpecialCard } from "../data/matchSpecialCard";
import "./SpecialCard.css";

/**
 * 内联富文本渲染：
 *   **粗体**            → <strong>
 *   {{时点/来源}}       → <span.sc-src-tag>
 */
function renderInline(text) {
  if (text == null) return null;
  const parts = String(text).split(/(\*\*[^*]+\*\*|\{\{[^}]+\}\})/g);
  return parts.map((p, j) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={j}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("{{") && p.endsWith("}}")) {
      return (
        <span key={j} className="sc-src-tag" title="数据时点 / 来源">
          {p.slice(2, -2)}
        </span>
      );
    }
    return <span key={j}>{p}</span>;
  });
}

export default function SpecialCard({ code }) {
  const card = matchSpecialCard(code);
  const [expanded, setExpanded] = useState(true); // 特殊卡片默认展开，警告性质

  if (!card) return null;

  const accent = card.badgeColor || "#fa541c";

  return (
    <div
      className="sc-panel"
      style={{
        borderColor: accent,
        background: `linear-gradient(180deg, ${accent}14 0%, #fafbfc 100%)`,
      }}
    >
      {/* 头部 */}
      <div
        className={`sc-head ${expanded ? "expanded" : ""}`}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <div className="sc-head-left">
          <div className="sc-badges">
            <span
              className="sc-type-badge"
              style={{ background: accent, color: "#fff" }}
            >
              {card.badgeLabel || "特殊资产"}
            </span>
            {card.lastUpdated && (
              <span className="sc-updated-tag" title="卡片内容最后更新时间">
                更新于 {card.lastUpdated}
              </span>
            )}
          </div>
          <h3 className="sc-name" style={{ color: accent }}>
            {card.name}
          </h3>
          <p className="sc-subtitle">{card.subtitle}</p>
        </div>
        <div className="sc-toggle" style={{ color: accent }}>
          {expanded ? "收起 ▲" : "展开 ▼"}
        </div>
      </div>

      {expanded && (
        <div className="sc-body">
          {/* ⚠️ 核心警告 */}
          {card.warning && (
            <div
              className="sc-warning"
              style={{
                borderLeftColor: accent,
                background: `${accent}0d`,
              }}
            >
              <span className="sc-warning-icon">⚠️</span>
              <div>{renderInline(card.warning)}</div>
            </div>
          )}

          {/* 估值框架 */}
          {card.valueFramework && (
            <section className="sc-section">
              <h4 className="sc-section-title">
                <span className="sc-section-icon">◆</span>
                {card.valueFramework.title}
              </h4>
              <div className="sc-formula" style={{ borderColor: accent }}>
                <code>{card.valueFramework.formula}</code>
              </div>
              <ul className="sc-interp-list">
                {(card.valueFramework.interpretation || []).map((line, i) => (
                  <li key={i}>{renderInline(line)}</li>
                ))}
              </ul>
            </section>
          )}

          {/* 关键输入 */}
          {card.keyInputs && card.keyInputs.length > 0 && (
            <section className="sc-section">
              <h4 className="sc-section-title">
                <span className="sc-section-icon">⌨</span>
                你需要自己查的关键数据
              </h4>
              <div className="sc-inputs-table">
                <div className="sc-inputs-head">
                  <span className="sc-in-label">字段</span>
                  <span className="sc-in-value">参考值</span>
                  <span className="sc-in-source">来源 / 提示</span>
                </div>
                {card.keyInputs.map((item, i) => (
                  <div key={i} className="sc-inputs-row">
                    <span className="sc-in-label">
                      {item.label}
                      {item.asOf && (
                        <span className="sc-src-tag sc-asof-tag">
                          {item.asOf.replace(/[{}]/g, "")}
                        </span>
                      )}
                    </span>
                    <span className="sc-in-value">
                      {item.placeholder || "—"}
                    </span>
                    <span className="sc-in-source">
                      {item.source && (
                        <span className="sc-in-url">{item.source}</span>
                      )}
                      {item.hint && (
                        <span className="sc-in-hint">{item.hint}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 必问清单 */}
          {card.checklist && card.checklist.length > 0 && (
            <section className="sc-section">
              <h4 className="sc-section-title">
                <span className="sc-section-icon">☑</span>
                买入前必问自己
              </h4>
              <ol className="sc-checklist">
                {card.checklist.map((x, i) => (
                  <li key={i}>{renderInline(x)}</li>
                ))}
              </ol>
            </section>
          )}

          {/* 红旗 */}
          {card.redFlags && card.redFlags.length > 0 && (
            <section className="sc-section">
              <h4 className="sc-section-title">
                <span className="sc-section-icon">⚑</span>
                红旗预警
              </h4>
              <ul className="sc-redflags">
                {card.redFlags.map((x, i) => (
                  <li key={i}>{renderInline(x)}</li>
                ))}
              </ul>
            </section>
          )}

          {/* 底部免责 */}
          {card.disclaimer && (
            <div className="sc-disclaimer">
              {renderInline(card.disclaimer)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
