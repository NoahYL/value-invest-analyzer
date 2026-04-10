import { useState, useEffect } from "react";
import axios from "axios";
import "./ValuationPanel.css";

const API_BASE = "http://localhost:8000";

function Tip({ text }) {
  return (
    <span className="val-tip-wrap">
      <span className="val-tip-icon">?</span>
      <span className="val-tip-bubble">{text}</span>
    </span>
  );
}

export default function ValuationPanel({ code, market }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    axios
      .get(`${API_BASE}/api/valuation`, { params: { code, market } })
      .then((res) => {
        if (res.data.status === "ok") setData(res.data.data);
      })
      .catch((e) => console.error("Valuation error", e))
      .finally(() => setLoading(false));
  }, [code, market]);

  if (loading) return <div className="val-loading">估值分析加载中...</div>;
  if (!data || !data.methods || data.methods.length === 0) return null;

  const score = data.score;
  const methods = data.methods;

  const analyst = methods.find((m) => m.name === "机构一致预期");
  const peg = methods.find((m) => m.name === "PEG估值");
  const graham = methods.find((m) => m.name === "格雷厄姆估值");

  return (
    <div className="val-panel">
      {/* 综合评分 */}
      {score && (
        <div className="val-score-bar">
          <span className="val-score-label">估值评分 <Tip text="综合机构预期、PEG、格雷厄姆三种方法的加权评分。越高代表越被低估，70以上偏低估，45以下偏高估。" /></span>
          <div className="val-score-track">
            <div
              className="val-score-fill"
              style={{ width: `${score.value}%`, background: score.color === "green" ? "#389e0d" : score.color === "red" ? "#cf1322" : "#d48806" }}
            />
          </div>
          <span className={`val-score-num ${score.color}`}>{score.value}</span>
          <span className={`val-signal ${score.color}`}>{score.label}</span>
        </div>
      )}

      {/* 机构一致预期 */}
      {analyst && (
        <div className="val-section">
          <h4 className="val-title">机构一致预期 <Tip text="券商分析师对这只股票未来价格的预测汇总。目标均价是所有分析师给出的目标价的平均值，百分比表示相对当前价格的上涨或下跌空间。" /></h4>
          <div className="val-target">
            <div className="val-target-main">
              <span className="val-target-label">目标均价</span>
              <span className="val-target-price">
                {analyst.currency && analyst.currency !== "CNY" ? "$" : "¥"}
                {analyst.target_price}
              </span>
              {analyst.upside != null && (
                <span className={`val-upside ${analyst.upside >= 0 ? "green" : "red"}`}>
                  {analyst.upside >= 0 ? "+" : ""}{analyst.upside}%
                </span>
              )}
            </div>
            {analyst.target_low && analyst.target_high && (
              <div className="val-target-range">
                <span className="val-range-label">
                  {analyst.currency && analyst.currency !== "CNY" ? "$" : "¥"}{analyst.target_low}
                </span>
                <div className="val-range-bar">
                  {analyst.current_price && (
                    <div
                      className="val-range-marker"
                      style={{
                        left: `${Math.min(Math.max(
                          ((analyst.current_price - analyst.target_low) /
                            (analyst.target_high - analyst.target_low)) * 100,
                          0
                        ), 100)}%`,
                      }}
                      title={`当前: ${analyst.current_price}`}
                    />
                  )}
                </div>
                <span className="val-range-label">
                  {analyst.currency && analyst.currency !== "CNY" ? "$" : "¥"}{analyst.target_high}
                </span>
              </div>
            )}
          </div>

          {/* 评级分布 */}
          {analyst.analyst_count > 0 && (
            <div className="val-ratings">
              <span className="val-analyst-count">{analyst.analyst_count}家机构评级</span>
              <div className="val-rating-bars">
                {analyst.buy > 0 && (
                  <div className="val-rating-seg buy" style={{ flex: analyst.buy }}>
                    买入 {analyst.buy}
                  </div>
                )}
                {analyst.hold > 0 && (
                  <div className="val-rating-seg hold" style={{ flex: analyst.hold }}>
                    持有 {analyst.hold}
                  </div>
                )}
                {analyst.sell > 0 && (
                  <div className="val-rating-seg sell" style={{ flex: analyst.sell }}>
                    卖出 {analyst.sell}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EPS 预测 */}
          {analyst.forecasts && analyst.forecasts.length > 0 && (
            <div className="val-forecasts">
              {analyst.forecasts.map((f) => (
                <div key={f.year} className="val-fc-item">
                  <span className="val-fc-year">
                    {f.year}{f.type === "预测" ? "E" : ""}
                  </span>
                  <span className="val-fc-eps">EPS {f.eps}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PEG 估值 */}
      {peg && (
        <div className="val-section">
          <h4 className="val-title">PEG 估值 <Tip text="PEG = 市盈率 / 盈利增长率。简单说就是看股价贵不贵要结合公司赚钱的增速来判断。PEG小于1说明增速快、估值低，是好机会；大于1.5说明估值已经跑在增速前面了。" /></h4>
          <div className="val-metrics">
            <div className="val-metric">
              <span className="val-metric-label">PE</span>
              <span className="val-metric-value">{peg.pe}</span>
            </div>
            <div className="val-metric">
              <span className="val-metric-label">增长率</span>
              <span className="val-metric-value">{peg.growth}%</span>
            </div>
            <div className="val-metric">
              <span className="val-metric-label">PEG</span>
              <span className={`val-metric-value ${peg.peg < 1 ? "green" : peg.peg > 1.5 ? "red" : "orange"}`}>
                {peg.peg}
              </span>
            </div>
          </div>
          <div className={`val-signal-tag ${peg.signal === "低估" ? "green" : peg.signal === "偏高" ? "red" : "orange"}`}>
            {peg.signal}
            {peg.signal === "低估" && " — PEG < 1，成长性高于估值"}
            {peg.signal === "合理" && " — PEG 1~1.5，估值匹配增速"}
            {peg.signal === "偏高" && " — PEG > 1.5，估值高于增速"}
          </div>
        </div>
      )}

      {/* 格雷厄姆估值 */}
      {graham && (
        <div className="val-section">
          <h4 className="val-title">格雷厄姆内在价值 <Tip text="巴菲特老师格雷厄姆提出的经典公式，根据每股收益(EPS)和未来增长率算出股票「应该值多少钱」。内在价值高于当前股价说明被低估，差距越大安全边际越高，投资越安心。" /></h4>
          <div className="val-graham">
            <div className="val-graham-row">
              <span>内在价值</span>
              <span className="val-graham-price">
                {graham.currency && graham.currency !== "CNY" ? "$" : "¥"}{graham.intrinsic_value}
              </span>
            </div>
            <div className="val-graham-row">
              <span>当前价格</span>
              <span>
                {graham.currency && graham.currency !== "CNY" ? "$" : "¥"}{graham.current_price}
              </span>
            </div>
            <div className="val-graham-row">
              <span>安全边际</span>
              <span className={graham.margin_of_safety > 0 ? "green" : "red"}>
                {graham.margin_of_safety > 0 ? "+" : ""}{graham.margin_of_safety}%
              </span>
            </div>
          </div>
          <div className={`val-signal-tag ${graham.signal === "低估" ? "green" : graham.signal === "偏高" ? "red" : "orange"}`}>
            {graham.signal}
            {graham.margin_of_safety != null && graham.margin_of_safety > 30 && " — 安全边际充足"}
            {graham.margin_of_safety != null && graham.margin_of_safety > 0 && graham.margin_of_safety <= 30 && " — 安全边际较小"}
            {graham.margin_of_safety != null && graham.margin_of_safety <= 0 && " — 价格高于内在价值"}
          </div>
          <div className="val-graham-note">
            基于 EPS={graham.eps}，增长率={graham.growth}%
          </div>
        </div>
      )}
    </div>
  );
}
