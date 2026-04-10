import { useState, useEffect, useRef } from "react";
import * as echarts from "echarts";
import axios from "axios";
import "./ComparisonPanel.css";

const API_BASE = "http://localhost:8000";

function formatMcap(v, market) {
  if (!v) return "-";
  if (market === "美股") {
    if (v >= 10000) return `$${(v / 10000).toFixed(1)}T`;
    if (v >= 100) return `$${(v / 100).toFixed(0)}B`;
    return `$${v.toFixed(0)}亿`;
  }
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万亿`;
  return `${v.toFixed(0)}亿`;
}

export default function ComparisonPanel({ code, market }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    axios
      .get(`${API_BASE}/api/comparison`, { params: { code, market } })
      .then((res) => {
        if (res.data.status === "ok") setData(res.data.data);
      })
      .catch((e) => console.error("Comparison error", e))
      .finally(() => setLoading(false));
  }, [code, market]);

  useEffect(() => {
    if (!data || !chartRef.current) return;
    renderChart(data);
    return () => chartInstance.current?.dispose();
  }, [data]);

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const renderChart = (d) => {
    // 取市值前 10 且 PE > 0 的公司
    const top = d.peers
      .filter((p) => p.pe && p.pe > 0 && p.ps && p.ps > 0)
      .slice(0, 10);

    if (!top.length) return;

    const names = top.map((p) => p.name);
    const peData = top.map((p) => ({
      value: p.pe,
      itemStyle: { color: p.is_current ? "#1677ff" : "#91caff" },
    }));
    const psData = top.map((p) => ({
      value: p.ps,
      itemStyle: { color: p.is_current ? "#fa8c16" : "#ffd591" },
    }));

    if (chartInstance.current) chartInstance.current.dispose();
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    chart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      legend: {
        data: ["PE (TTM)", "PS (TTM)"],
        top: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 10, right: 20, top: 30, bottom: 10, containLabel: true },
      xAxis: {
        type: "category",
        data: names,
        axisLabel: {
          fontSize: 10,
          rotate: names.length > 6 ? 30 : 0,
          interval: 0,
        },
      },
      yAxis: { type: "value", axisLabel: { fontSize: 10 } },
      series: [
        {
          name: "PE (TTM)",
          type: "bar",
          data: peData,
          barMaxWidth: 24,
          label: {
            show: true,
            position: "top",
            fontSize: 9,
            formatter: (p) => p.value.toFixed(1),
          },
        },
        {
          name: "PS (TTM)",
          type: "bar",
          data: psData,
          barMaxWidth: 24,
          label: {
            show: true,
            position: "top",
            fontSize: 9,
            formatter: (p) => p.value.toFixed(1),
          },
        },
      ],
    });
  };

  if (loading) return <div className="cmp-loading">同行对比加载中...</div>;
  if (!data) return null;

  const { peers, median, position, industry } = data;

  return (
    <div className="cmp-panel">
      <div className="cmp-header">
        <h3 className="cmp-title">
          同行业对比
          <span className="cmp-industry">{industry}</span>
        </h3>
        {position && (
          <span
            className={`cmp-position ${
              position === "偏低" ? "green" : position === "偏高" ? "red" : "orange"
            }`}
          >
            当前估值在行业中{position}
          </span>
        )}
      </div>

      {/* 柱状图 */}
      <div ref={chartRef} className="cmp-chart" />

      {/* 对比表格 */}
      <div className="cmp-table-wrap">
        <table className="cmp-table">
          <thead>
            <tr>
              <th>公司</th>
              <th className="num">PE</th>
              <th className="num">PB</th>
              <th className="num">PS</th>
              <th className="num">ROE</th>
              <th className="num">市值</th>
            </tr>
          </thead>
          <tbody>
            {/* 行业中位数 */}
            <tr className="cmp-median-row">
              <td>行业中位数</td>
              <td className="num">{median.pe ?? "-"}</td>
              <td className="num">{median.pb ?? "-"}</td>
              <td className="num">{median.ps ?? "-"}</td>
              <td className="num">{median.roe ? `${median.roe}%` : "-"}</td>
              <td className="num">-</td>
            </tr>
            {peers
              .filter((p) => p.pe && p.pe > 0)
              .slice(0, 12)
              .map((p) => (
                <tr key={p.code} className={p.is_current ? "cmp-current" : ""}>
                  <td>
                    <span className="cmp-name">{p.name}</span>
                    <span className="cmp-code">{p.code}</span>
                  </td>
                  <td className="num">{p.pe ?? "-"}</td>
                  <td className="num">{p.pb ?? "-"}</td>
                  <td className="num">{p.ps ?? "-"}</td>
                  <td className="num">{p.roe ? `${p.roe}%` : "-"}</td>
                  <td className="num">{formatMcap(p.mcap, market)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
