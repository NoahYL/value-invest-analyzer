import { useState, useEffect, useRef } from "react";
import * as echarts from "echarts";
import axios from "axios";
import "./QualityPanel.css";

const API_BASE = "http://localhost:8000";

// 4 个切换指标
const METRICS = [
  { key: "revenue",     label: "营收",     unit: "亿",  color: "#1677ff" },
  { key: "net_profit",  label: "净利润",   unit: "亿",  color: "#52c41a" },
  { key: "net_margin",  label: "净利率",   unit: "%",  color: "#fa8c16" },
  { key: "roe",         label: "ROE",     unit: "%",  color: "#722ed1" },
];

function colorForGross(v) {
  if (v == null) return "";
  if (v >= 40) return "green";
  if (v >= 20) return "";
  return "red";
}
function colorForNet(v) {
  if (v == null) return "";
  if (v >= 20) return "green";
  if (v >= 10) return "";
  return "red";
}
function colorForCashQuality(v) {
  if (v == null) return "";
  if (v >= 90) return "green";
  if (v >= 70) return "";
  return "red";
}
function colorForDebt(v) {
  if (v == null) return "";
  if (v < 40) return "green";
  if (v < 70) return "";
  return "red";
}
function colorForFcfMargin(v) {
  if (v == null) return "";
  if (v >= 15) return "green";
  if (v >= 5) return "";
  return "red";
}

export default function QualityPanel({ code, market }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeMetric, setActiveMetric] = useState("revenue");
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    axios
      .get(`${API_BASE}/api/quality`, { params: { code, market } })
      .then((res) => {
        if (res.data.status === "ok") setData(res.data.data);
      })
      .catch((e) => console.error("Quality error", e))
      .finally(() => setLoading(false));
  }, [code, market]);

  useEffect(() => {
    if (!data || !chartRef.current) return;
    renderChart(data.history, activeMetric);
    return () => chartInstance.current?.dispose();
  }, [data, activeMetric]);

  useEffect(() => {
    const handle = () => chartInstance.current?.resize();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  const renderChart = (history, metricKey) => {
    if (!history || !history.length) return;
    const metric = METRICS.find((m) => m.key === metricKey);
    const xs = history.map((h) => h.year);
    const ys = history.map((h) => h[metricKey]);

    if (chartInstance.current) chartInstance.current.dispose();
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    chart.setOption({
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const p = params[0];
          const v = p.value;
          return `<div style="font-size:12px">
            <div style="font-weight:600;margin-bottom:4px">${p.axisValue}</div>
            ${metric.label}: <b>${v == null ? "-" : v}</b> ${metric.unit}
          </div>`;
        },
      },
      grid: { left: 12, right: 20, top: 20, bottom: 10, containLabel: true },
      xAxis: {
        type: "category",
        data: xs,
        axisLabel: { fontSize: 10 },
        axisLine: { lineStyle: { color: "#ddd" } },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          fontSize: 10,
          formatter: (v) => (metric.unit === "%" ? `${v}%` : v),
        },
        splitLine: { lineStyle: { color: "#f0f0f0" } },
      },
      series: [
        {
          name: metric.label,
          type: "line",
          data: ys,
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { color: metric.color, width: 2.5 },
          itemStyle: { color: metric.color },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: metric.color + "55" },
              { offset: 1, color: metric.color + "00" },
            ]),
          },
          label: {
            show: true,
            position: "top",
            fontSize: 10,
            color: "#666",
            formatter: (p) => (p.value == null ? "" : p.value),
          },
        },
      ],
    });
  };

  if (loading) return <div className="q-loading">财务质量加载中...</div>;
  if (!data) return null;

  const ind = data.indicators || {};
  const flags = data.flags || [];

  // 指标卡列表
  const cards = [
    {
      label: "毛利率",
      tip: "生意本身赚不赚钱。>40%是好生意，<20%是苦生意。",
      value: ind.gross_margin,
      display: ind.gross_margin == null ? null : `${ind.gross_margin}%`,
      color: colorForGross(ind.gross_margin),
    },
    {
      label: "净利率",
      tip: "赚到手的钱占营收的比例。>20%很强，<10%偏弱。",
      value: ind.net_margin,
      display: ind.net_margin == null ? null : `${ind.net_margin}%`,
      color: colorForNet(ind.net_margin),
    },
    {
      label: "净利润含金量",
      tip: "经营现金流 / 净利润。段永平爱看。≥90%说明赚的钱真到账了，<70%要警惕。",
      value: ind.cash_quality,
      display: ind.cash_quality == null ? null : `${ind.cash_quality}%`,
      color: colorForCashQuality(ind.cash_quality),
    },
    {
      label: "资产负债率",
      tip: "总负债 / 总资产。<40%健康，>70%需评估偿债压力（金融/地产例外）。",
      value: ind.debt_ratio,
      display: ind.debt_ratio == null ? null : `${ind.debt_ratio}%`,
      color: colorForDebt(ind.debt_ratio),
    },
  ];

  // 美股多一个 FCF 利润率
  if (ind.fcf_margin != null) {
    cards.push({
      label: "FCF 利润率",
      tip: "自由现金流 / 营收。真正落袋为安的钱。>15%优秀，<5%偏弱。",
      value: ind.fcf_margin,
      display: `${ind.fcf_margin}%`,
      color: colorForFcfMargin(ind.fcf_margin),
    });
  }

  return (
    <div className="q-panel">
      {/* 指标卡 */}
      <h3 className="section-title">
        质量指标
        {ind.year && <span className="report-tag">{ind.year}年报</span>}
      </h3>
      <div className={`q-grid ${cards.length >= 5 ? "q-grid-5" : "q-grid-4"}`}>
        {cards.map((c) => (
          <div key={c.label} className="q-card" title={c.tip}>
            <div className="q-label">{c.label}</div>
            <div className={`q-value ${c.color}`}>{c.display ?? "暂无"}</div>
            <div className="q-tip">{c.tip}</div>
          </div>
        ))}
      </div>

      {/* 财务红旗 */}
      {flags.length > 0 && (
        <div className="q-flags">
          <h3 className="section-title" style={{ marginTop: 20 }}>
            风险提示
            <span className="report-tag">{flags.length} 项</span>
          </h3>
          {flags.map((f, idx) => (
            <div key={idx} className={`q-flag q-flag-${f.level}`}>
              <span className="q-flag-icon">!</span>
              <div className="q-flag-body">
                <div className="q-flag-title">{f.title}</div>
                <div className="q-flag-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 10 年趋势图 */}
      {data.history && data.history.length > 0 && (
        <div className="q-trend">
          <div className="q-trend-head">
            <h3 className="section-title" style={{ margin: 0, border: "none" }}>
              历史趋势
              <span className="report-tag">
                近 {data.history.length} 年
              </span>
            </h3>
            <div className="q-tabs">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  className={`q-tab ${activeMetric === m.key ? "active" : ""}`}
                  onClick={() => setActiveMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div ref={chartRef} className="q-chart" />
        </div>
      )}
    </div>
  );
}
