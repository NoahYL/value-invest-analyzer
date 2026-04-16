import { useState, useEffect } from "react";
import axios from "axios";
import "./DCFPanel.css";

const API_BASE = "http://localhost:8000";

// 三情境默认假设
const DEFAULT_SCENARIOS = {
  bear: {
    label: "悲观",
    color: "#cf1322",
    g1: 3,   // 前 5 年
    g2: 2,   // 5-10 年
    gp: 2,   // 永续
    r: 10,   // 折现率
  },
  base: {
    label: "中性",
    color: "#1677ff",
    g1: 8,
    g2: 5,
    gp: 3,
    r: 9,
  },
  bull: {
    label: "乐观",
    color: "#389e0d",
    g1: 15,
    g2: 10,
    gp: 3,
    r: 8,
  },
};

function storageKey(code) {
  return `dcf_${code}`;
}

// 10 年 DCF + 永续 → 每股内在价值
function calcDCF({ baseFcf, shares, g1, g2, gp, r }) {
  if (!baseFcf || !shares || r <= gp) return null;
  const R = r / 100;
  const G1 = g1 / 100;
  const G2 = g2 / 100;
  const GP = gp / 100;

  let pvSum = 0;
  let fcf = baseFcf;
  // 年份 1-5
  for (let t = 1; t <= 5; t++) {
    fcf = fcf * (1 + G1);
    pvSum += fcf / Math.pow(1 + R, t);
  }
  // 年份 6-10
  for (let t = 6; t <= 10; t++) {
    fcf = fcf * (1 + G2);
    pvSum += fcf / Math.pow(1 + R, t);
  }
  // 终值（10 年末 FCF × (1+g) / (r-g)，再折现到当前）
  const tv = (fcf * (1 + GP)) / (R - GP);
  const pvTV = tv / Math.pow(1 + R, 10);
  const totalEV = pvSum + pvTV; // 亿

  const perShare = (totalEV / shares).toFixed(2); // 元/股
  return Number(perShare);
}

export default function DCFPanel({ code, market }) {
  const [base, setBase] = useState(null);
  const [smart, setSmart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState(DEFAULT_SCENARIOS);
  const [fcfOverride, setFcfOverride] = useState(null);
  const [showSmartDetail, setShowSmartDetail] = useState(false);

  // 拉 dcf_base + dcf_smart 数据
  useEffect(() => {
    setLoading(true);
    setBase(null);
    setSmart(null);
    axios
      .get(`${API_BASE}/api/quality`, { params: { code, market } })
      .then((res) => {
        if (res.data.status === "ok") {
          setBase(res.data.data.dcf_base);
          setSmart(res.data.data.dcf_smart || null);
        }
      })
      .catch((e) => console.error("DCF base error", e))
      .finally(() => setLoading(false));

    // 恢复用户自定义
    try {
      const saved = localStorage.getItem(storageKey(code));
      if (saved) {
        const obj = JSON.parse(saved);
        setScenarios(obj.scenarios || DEFAULT_SCENARIOS);
        setFcfOverride(obj.fcfOverride ?? null);
      } else {
        setScenarios(DEFAULT_SCENARIOS);
        setFcfOverride(null);
      }
    } catch (e) {
      setScenarios(DEFAULT_SCENARIOS);
      setFcfOverride(null);
    }
  }, [code, market]);

  const persist = (next, fcfOv = fcfOverride) => {
    try {
      localStorage.setItem(
        storageKey(code),
        JSON.stringify({ scenarios: next, fcfOverride: fcfOv })
      );
    } catch (e) {}
  };

  const updateParam = (scenKey, param, value) => {
    const v = Number(value);
    const next = {
      ...scenarios,
      [scenKey]: { ...scenarios[scenKey], [param]: v },
    };
    setScenarios(next);
    persist(next);
  };

  const updateFcf = (v) => {
    const num = v === "" ? null : Number(v);
    setFcfOverride(num);
    persist(scenarios, num);
  };

  const reset = () => {
    setScenarios(DEFAULT_SCENARIOS);
    setFcfOverride(null);
    try {
      localStorage.removeItem(storageKey(code));
    } catch (e) {}
  };

  /** 应用后端返回的智能默认值（保留 label/color，只覆盖 g1/g2/gp/r） */
  const applySmart = () => {
    if (!smart || !smart.suggested) return;
    const next = {};
    for (const [key, scen] of Object.entries(DEFAULT_SCENARIOS)) {
      const sug = smart.suggested[key] || {};
      next[key] = {
        ...scen,
        g1: sug.g1 ?? scen.g1,
        g2: sug.g2 ?? scen.g2,
        gp: sug.gp ?? scen.gp,
        r: sug.r ?? scen.r,
      };
    }
    setScenarios(next);
    persist(next);
  };

  if (loading) return <div className="dcf-loading">DCF 加载中...</div>;
  if (!base || !base.base_fcf || !base.shares_outstanding) {
    return (
      <div className="dcf-empty">
        缺少 FCF 或股本数据，暂无法进行 DCF 估算。
      </div>
    );
  }

  const fcf = fcfOverride != null ? fcfOverride : base.base_fcf;
  const sym = base.currency === "CNY" ? "¥" : "$";
  const unit = base.currency === "CNY" ? "亿元" : "亿"; // 统一"亿"

  // 三情境结果
  const results = Object.entries(scenarios).map(([key, s]) => {
    const iv = calcDCF({
      baseFcf: fcf,
      shares: base.shares_outstanding,
      g1: s.g1,
      g2: s.g2,
      gp: s.gp,
      r: s.r,
    });
    const mos =
      iv && base.current_price
        ? ((iv - base.current_price) / iv) * 100
        : null;
    return { key, scen: s, iv, mos };
  });

  return (
    <div className="dcf-panel">
      <div className="dcf-disclaimer">
        <strong>DCF 的意义不是得到精确价格，而是看清楚假设。</strong>
        你输入不同的增长率/折现率，就能看到「要多乐观才能支撑当前股价」。
      </div>

      {/* 智能默认值面板 */}
      {smart && smart.suggested && (
        <div className="dcf-smart">
          <div className="dcf-smart-head">
            <div className="dcf-smart-title">
              🧠 智能默认值
              <span className="dcf-smart-asof">
                基于历史 {smart.asOf ? `· ${smart.asOf}` : ""}
              </span>
            </div>
            <div className="dcf-smart-actions">
              <button
                className="dcf-smart-toggle"
                onClick={() => setShowSmartDetail((v) => !v)}
              >
                {showSmartDetail ? "收起说明 ▲" : "查看推导 ▼"}
              </button>
              <button className="dcf-smart-apply" onClick={applySmart}>
                一键应用到三情境
              </button>
            </div>
          </div>

          {smart.warning && (
            <div className="dcf-smart-warning">{smart.warning}</div>
          )}

          {showSmartDetail && (
            <div className="dcf-smart-detail">
              <div className="dcf-smart-row">
                <span className="dcf-smart-param">g1 前 5 年增速</span>
                <span className="dcf-smart-val">
                  {smart.suggested.base.g1}%
                </span>
                <span className="dcf-smart-src">{smart.rationale.g1}</span>
              </div>
              <div className="dcf-smart-row">
                <span className="dcf-smart-param">g2 6-10 年增速</span>
                <span className="dcf-smart-val">
                  {smart.suggested.base.g2}%
                </span>
                <span className="dcf-smart-src">{smart.rationale.g2}</span>
              </div>
              <div className="dcf-smart-row">
                <span className="dcf-smart-param">gp 永续增速</span>
                <span className="dcf-smart-val">
                  {smart.suggested.base.gp}%
                </span>
                <span className="dcf-smart-src">{smart.rationale.gp}</span>
              </div>
              <div className="dcf-smart-row">
                <span className="dcf-smart-param">r 折现率</span>
                <span className="dcf-smart-val">{smart.suggested.base.r}%</span>
                <span className="dcf-smart-src">{smart.rationale.r}</span>
              </div>

              <div className="dcf-smart-evidence">
                <div className="dcf-smart-evidence-title">历史 CAGR 参考：</div>
                <div className="dcf-smart-evidence-grid">
                  <span>
                    净利润 5y:{" "}
                    <b>
                      {smart.evidence.cagr_5y_np != null
                        ? `${smart.evidence.cagr_5y_np}%`
                        : "—"}
                    </b>
                  </span>
                  <span>
                    净利润 3y:{" "}
                    <b>
                      {smart.evidence.cagr_3y_np != null
                        ? `${smart.evidence.cagr_3y_np}%`
                        : "—"}
                    </b>
                  </span>
                  <span>
                    营收 5y:{" "}
                    <b>
                      {smart.evidence.cagr_5y_rev != null
                        ? `${smart.evidence.cagr_5y_rev}%`
                        : "—"}
                    </b>
                  </span>
                  <span>
                    营收 3y:{" "}
                    <b>
                      {smart.evidence.cagr_3y_rev != null
                        ? `${smart.evidence.cagr_3y_rev}%`
                        : "—"}
                    </b>
                  </span>
                </div>
              </div>

              <div className="dcf-smart-scens">
                推导三情境：悲观 = g1 − 5pp，r + 1pp ｜ 中性 = 历史基线 ｜ 乐观 = g1 +
                5pp，r − 1pp
              </div>
            </div>
          )}
        </div>
      )}

      {/* 基础数据 */}
      <div className="dcf-base">
        <div className="dcf-base-item">
          <span className="dcf-base-label">基准 FCF</span>
          <input
            type="number"
            step="0.01"
            className="dcf-base-input"
            value={fcf}
            onChange={(e) => updateFcf(e.target.value)}
          />
          <span className="dcf-base-unit">{unit}</span>
        </div>
        <div className="dcf-base-item readonly">
          <span className="dcf-base-label">总股本</span>
          <span className="dcf-base-val">
            {base.shares_outstanding} 亿股
          </span>
        </div>
        <div className="dcf-base-item readonly">
          <span className="dcf-base-label">当前价</span>
          <span className="dcf-base-val">
            {sym}
            {base.current_price ?? "-"}
          </span>
        </div>
        <button className="dcf-reset" onClick={reset}>
          还原
        </button>
      </div>
      <div className="dcf-fcf-source">FCF 来源：{base.fcf_source}</div>

      {/* 三情境结果卡 */}
      <div className="dcf-results">
        {results.map(({ key, scen, iv, mos }) => {
          const mosColor =
            mos == null ? "" : mos > 30 ? "green" : mos > 0 ? "orange" : "red";
          return (
            <div
              key={key}
              className="dcf-card"
              style={{ borderTop: `3px solid ${scen.color}` }}
            >
              <div className="dcf-card-head">
                <span
                  className="dcf-scen-badge"
                  style={{ background: scen.color }}
                >
                  {scen.label}
                </span>
              </div>
              <div className="dcf-iv-row">
                <span className="dcf-iv-label">每股内在价值</span>
                <span
                  className="dcf-iv-val"
                  style={{ color: scen.color }}
                >
                  {iv != null ? `${sym}${iv}` : "-"}
                </span>
              </div>
              <div className="dcf-iv-row">
                <span className="dcf-iv-label">安全边际</span>
                <span className={`dcf-mos ${mosColor}`}>
                  {mos != null ? `${mos >= 0 ? "+" : ""}${mos.toFixed(1)}%` : "-"}
                </span>
              </div>

              {/* 参数编辑 */}
              <div className="dcf-params">
                <div className="dcf-param">
                  <label>前5年增速</label>
                  <div>
                    <input
                      type="number"
                      value={scen.g1}
                      step="0.5"
                      onChange={(e) => updateParam(key, "g1", e.target.value)}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="dcf-param">
                  <label>5-10年</label>
                  <div>
                    <input
                      type="number"
                      value={scen.g2}
                      step="0.5"
                      onChange={(e) => updateParam(key, "g2", e.target.value)}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="dcf-param">
                  <label>永续增速</label>
                  <div>
                    <input
                      type="number"
                      value={scen.gp}
                      step="0.5"
                      onChange={(e) => updateParam(key, "gp", e.target.value)}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="dcf-param">
                  <label>折现率</label>
                  <div>
                    <input
                      type="number"
                      value={scen.r}
                      step="0.5"
                      onChange={(e) => updateParam(key, "r", e.target.value)}
                    />
                    <span>%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="dcf-method-note">
        方法：前 5 年按 g1 增长，6-10 年按 g2 增长，10 年后按永续增长率 g3
        计算终值，按折现率 r 贴现回当前。
      </div>
    </div>
  );
}
