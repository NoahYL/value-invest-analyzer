import { useState, useEffect } from "react";
import "./BusinessModelTag.css";

// 生意分层（段永平/纽约金冰框架的简化版）
const TIERS = [
  {
    key: "T1",
    title: "顶级生意",
    color: "#389e0d",
    light: "#f6ffed",
    desc: "强品牌 / 强护城河 / 有定价权",
    examples: "如：茅台、可口可乐、LV",
    criteria: [
      "几十年后产品大概率还存在",
      "涨价不会影响需求",
      "ROE 长期 >20%、毛利率 >40%",
      "公司赚的钱≈自由现金流",
    ],
  },
  {
    key: "T2",
    title: "优秀生意",
    color: "#1677ff",
    light: "#e6f4ff",
    desc: "平台 / 网络效应 / 规模壁垒",
    examples: "如：苹果、微软、腾讯",
    criteria: [
      "规模越大成本越低或价值越高",
      "新进入者难以复制",
      "ROE 长期 >15%",
      "有持续的研发/资本开支",
    ],
  },
  {
    key: "T3",
    title: "一般生意",
    color: "#d48806",
    light: "#fffbe6",
    desc: "周期性 / 竞争激烈 / 技术迭代快",
    examples: "如：钢铁、面板、大部分科技硬件",
    criteria: [
      "盈利随周期波动大",
      "需要不断资本开支才能维持",
      "产品差异化弱，价格战频繁",
    ],
  },
  {
    key: "T4",
    title: "避开",
    color: "#cf1322",
    light: "#fff1f0",
    desc: "重资产 / 无差异 / 烧钱生意",
    examples: "如：航空、许多初创/烧钱平台",
    criteria: [
      "长期很难赚到自由现金流",
      "不停融资、股权被稀释",
      "行业增长靠补贴/政策",
    ],
  },
];

function storageKey(code) {
  return `bm_tier_${code}`;
}

export default function BusinessModelTag({ code }) {
  const [tier, setTier] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(code));
      setTier(saved || null);
      setEditing(false);
    } catch (e) {
      setTier(null);
    }
  }, [code]);

  const save = (key) => {
    try {
      localStorage.setItem(storageKey(code), key);
      setTier(key);
      setEditing(false);
    } catch (e) {
      console.error(e);
    }
  };

  const clear = () => {
    try {
      localStorage.removeItem(storageKey(code));
      setTier(null);
      setEditing(false);
    } catch (e) {}
  };

  const current = TIERS.find((t) => t.key === tier);

  return (
    <div className="bm-panel">
      <div className="bm-header">
        <h3 className="section-title" style={{ margin: 0, border: "none" }}>
          商业模式分层
          <span className="bm-hint-tip">你的判断（本地保存）</span>
        </h3>
        {current && !editing && (
          <button className="bm-edit-btn" onClick={() => setEditing(true)}>
            修改
          </button>
        )}
      </div>

      {/* 当前标签（已评估） */}
      {current && !editing && (
        <div
          className="bm-current"
          style={{
            background: current.light,
            borderColor: current.color + "66",
          }}
        >
          <span
            className="bm-badge"
            style={{ background: current.color }}
          >
            {current.key}
          </span>
          <div className="bm-body">
            <div className="bm-title-line">
              <strong style={{ color: current.color }}>{current.title}</strong>
              <span className="bm-desc">{current.desc}</span>
            </div>
            <div className="bm-examples">{current.examples}</div>
          </div>
          <button className="bm-clear-btn" onClick={clear} title="清除评估">
            ×
          </button>
        </div>
      )}

      {/* 未评估 or 编辑中 */}
      {(!current || editing) && (
        <div className="bm-choose">
          <div className="bm-choose-hint">
            先判断这是一门什么级别的生意，再谈估值。
          </div>
          <div className="bm-tiers">
            {TIERS.map((t) => (
              <button
                key={t.key}
                className={`bm-tier-btn ${tier === t.key ? "active" : ""}`}
                style={{
                  borderColor: tier === t.key ? t.color : "#e8e8e8",
                  background: tier === t.key ? t.light : "#fff",
                }}
                onClick={() => save(t.key)}
              >
                <div className="bm-tier-head">
                  <span
                    className="bm-tier-key"
                    style={{ background: t.color }}
                  >
                    {t.key}
                  </span>
                  <strong style={{ color: t.color }}>{t.title}</strong>
                </div>
                <div className="bm-tier-desc">{t.desc}</div>
                <ul className="bm-tier-criteria">
                  {t.criteria.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
          {editing && (
            <button className="bm-cancel-btn" onClick={() => setEditing(false)}>
              取消
            </button>
          )}
        </div>
      )}
    </div>
  );
}
