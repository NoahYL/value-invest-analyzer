import { useState, useEffect, useRef } from "react";
import * as echarts from "echarts";
import "./MoatRadar.css";

// 5 个护城河维度
const DIMENSIONS = [
  {
    key: "brand",
    label: "品牌",
    tip: "消费者是否愿意为这个品牌支付溢价？没有替代品也不会走吗？",
  },
  {
    key: "network",
    label: "网络效应",
    tip: "用户越多价值是否越大？比如社交、电商平台。",
  },
  {
    key: "cost",
    label: "成本优势",
    tip: "规模经济/独特资源/地理位置让它的成本长期低于竞争对手。",
  },
  {
    key: "switching",
    label: "转换成本",
    tip: "客户离开它要付出多少代价？比如企业软件、银行账户。",
  },
  {
    key: "intangible",
    label: "无形资产",
    tip: "专利/许可证/政府特许经营权等难以复制的无形资产。",
  },
];

const DEFAULT_SCORES = { brand: 0, network: 0, cost: 0, switching: 0, intangible: 0 };

function storageKey(code) {
  return `moat_${code}`;
}

export default function MoatRadar({ code }) {
  const [scores, setScores] = useState(DEFAULT_SCORES);
  const [note, setNote] = useState("");
  const [hasData, setHasData] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // 从 localStorage 恢复
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(code));
      if (saved) {
        const obj = JSON.parse(saved);
        setScores({ ...DEFAULT_SCORES, ...(obj.scores || {}) });
        setNote(obj.note || "");
        setHasData(true);
      } else {
        setScores(DEFAULT_SCORES);
        setNote("");
        setHasData(false);
      }
    } catch (e) {
      setScores(DEFAULT_SCORES);
      setNote("");
      setHasData(false);
    }
  }, [code]);

  // 渲染雷达图
  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.dispose();
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const values = DIMENSIONS.map((d) => scores[d.key] || 0);
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / 5;
    const color =
      avg >= 3.5 ? "#389e0d" : avg >= 2 ? "#1677ff" : "#d48806";

    chart.setOption({
      tooltip: {},
      radar: {
        indicator: DIMENSIONS.map((d) => ({ name: d.label, max: 5 })),
        radius: "65%",
        splitNumber: 5,
        axisName: {
          color: "#666",
          fontSize: 11,
        },
        splitArea: {
          areaStyle: {
            color: ["#fafbfc", "#fff"],
          },
        },
        splitLine: {
          lineStyle: { color: "#eee" },
        },
        axisLine: {
          lineStyle: { color: "#eee" },
        },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: values,
              name: "护城河评分",
              lineStyle: { color, width: 2 },
              itemStyle: { color },
              areaStyle: { color: color + "33" },
              label: {
                show: true,
                fontSize: 11,
                color: "#666",
                formatter: (p) => (p.value > 0 ? p.value : ""),
              },
            },
          ],
        },
      ],
    });

    return () => chartInstance.current?.dispose();
  }, [scores]);

  const handleSlide = (key, val) => {
    const next = { ...scores, [key]: Number(val) };
    setScores(next);
    try {
      localStorage.setItem(
        storageKey(code),
        JSON.stringify({ scores: next, note })
      );
      setHasData(true);
    } catch (e) {}
  };

  const handleNote = (val) => {
    setNote(val);
    try {
      localStorage.setItem(
        storageKey(code),
        JSON.stringify({ scores, note: val })
      );
      setHasData(true);
    } catch (e) {}
  };

  const clear = () => {
    try {
      localStorage.removeItem(storageKey(code));
      setScores(DEFAULT_SCORES);
      setNote("");
      setHasData(false);
    } catch (e) {}
  };

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const avg = (total / 5).toFixed(1);
  const grade =
    avg >= 4 ? "宽护城河" : avg >= 3 ? "有护城河" : avg >= 2 ? "弱护城河" : "无护城河";

  return (
    <div className="moat-panel">
      <div className="moat-header">
        <h3 className="section-title" style={{ margin: 0, border: "none" }}>
          护城河自评
          <span className="moat-hint-tip">你的判断（本地保存）</span>
        </h3>
        {hasData && (
          <button className="moat-clear" onClick={clear}>
            清除
          </button>
        )}
      </div>

      <div className="moat-body">
        {/* 雷达图 */}
        <div className="moat-chart-wrap">
          <div ref={chartRef} className="moat-chart" />
          {hasData && (
            <div className="moat-summary">
              <span className="moat-summary-avg">{avg}</span>
              <span className="moat-summary-grade">{grade}</span>
            </div>
          )}
        </div>

        {/* 评分滑块 */}
        <div className="moat-sliders">
          {DIMENSIONS.map((d) => (
            <div key={d.key} className="moat-slider-row">
              <div className="moat-slider-head">
                <span className="moat-dim-label">{d.label}</span>
                <span className="moat-dim-val">{scores[d.key]}</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                value={scores[d.key]}
                onChange={(e) => handleSlide(d.key, e.target.value)}
                className="moat-slider"
              />
              <div className="moat-dim-tip">{d.tip}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 备注 */}
      <textarea
        className="moat-note"
        placeholder="（可选）你认为的护城河核心来源，或者最担心的崩塌点..."
        value={note}
        onChange={(e) => handleNote(e.target.value)}
        rows={2}
      />
    </div>
  );
}
