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

  if (loading) return <div className="val-loading">价值估算加载中...</div>;
  if (!data || !data.methods || data.methods.length === 0) return null;

  const methods = data.methods;
  const peg = methods.find((m) => m.name === "PEG估值");
  const graham = methods.find((m) => m.name === "格雷厄姆估值");

  if (!peg && !graham) return null;

  return (
    <div className="val-panel">
      <div className="val-disclaimer">
        以下估值为<strong>参考性计算</strong>，基于历史盈利与简单增长假设，不代表买入信号。
        价值投资更重要的是理解生意本身、护城河和长期现金流。
      </div>

      {/* PEG 估值 */}
      {peg && (
        <div className="val-section">
          <h4 className="val-title">
            PEG 参考{" "}
            <Tip text="PEG = 市盈率 / 盈利增长率。结合股价贵不贵与公司成长速度的简单参考。PEG<1 通常意味着增速高于估值，PEG>1.5 意味着估值跑在增速前面。" />
          </h4>
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
              <span
                className={`val-metric-value ${
                  peg.peg < 1 ? "green" : peg.peg > 1.5 ? "red" : "orange"
                }`}
              >
                {peg.peg}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 格雷厄姆估值 */}
      {graham && (
        <div className="val-section">
          <h4 className="val-title">
            格雷厄姆内在价值参考{" "}
            <Tip text="格雷厄姆的经典公式：根据 EPS 和增长率反推「静态估值」。适合稳定盈利的成熟企业，不适合高成长或周期股。安全边际越大，犯错容忍度越高。" />
          </h4>
          <div className="val-graham">
            <div className="val-graham-row">
              <span>内在价值</span>
              <span className="val-graham-price">
                {graham.currency && graham.currency !== "CNY" ? "$" : "¥"}
                {graham.intrinsic_value}
              </span>
            </div>
            <div className="val-graham-row">
              <span>当前价格</span>
              <span>
                {graham.currency && graham.currency !== "CNY" ? "$" : "¥"}
                {graham.current_price}
              </span>
            </div>
            <div className="val-graham-row">
              <span>安全边际</span>
              <span className={graham.margin_of_safety > 0 ? "green" : "red"}>
                {graham.margin_of_safety > 0 ? "+" : ""}
                {graham.margin_of_safety}%
              </span>
            </div>
          </div>
          <div className="val-graham-note">
            基于 EPS={graham.eps}，增长率={graham.growth}%（历史数据外推）
          </div>
        </div>
      )}
    </div>
  );
}
