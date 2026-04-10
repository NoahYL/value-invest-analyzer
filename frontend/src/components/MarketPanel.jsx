import { useState, useEffect, useRef } from "react";
import * as echarts from "echarts";
import axios from "axios";
import "./MarketPanel.css";

const API_BASE = "http://localhost:8000";
const PERIODS = [
  { key: "3m", label: "近3月" },
  { key: "6m", label: "近6月" },
  { key: "1y", label: "近1年" },
];

export default function MarketPanel({ code, market }) {
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [period, setPeriod] = useState("3m");
  const [klineLoading, setKlineLoading] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const klineAbort = useRef(null);

  // 获取实时报价
  const fetchQuote = async () => {
    setQuoteLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/quote`, {
        params: { code, market },
      });
      if (res.data.status === "ok") setQuote(res.data.data);
    } catch (e) {
      if (!axios.isCancel(e)) console.error("Quote fetch error", e);
    } finally {
      setQuoteLoading(false);
    }
  };

  // 获取K线并绑定图表
  const fetchKline = async (p) => {
    // 取消上一次未完成的请求
    if (klineAbort.current) klineAbort.current.abort();
    const controller = new AbortController();
    klineAbort.current = controller;

    setKlineLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/kline`, {
        params: { code, market, period: p },
        signal: controller.signal,
      });
      if (res.data.status === "ok") {
        renderChart(res.data.data);
      }
    } catch (e) {
      if (!axios.isCancel(e)) console.error("Kline fetch error", e);
    } finally {
      if (klineAbort.current === controller) setKlineLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
    fetchKline(period);
    return () => {
      if (klineAbort.current) klineAbort.current.abort();
      chartInstance.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, market]);

  useEffect(() => {
    fetchKline(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // 窗口resize时自动调整图表大小
  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const renderChart = (data) => {
    if (!chartRef.current || !data.length) return;

    if (chartInstance.current) chartInstance.current.dispose();
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const dates = data.map((d) => d.date);
    const ohlc = data.map((d) => [d.open, d.close, d.low, d.high]);
    const volumes = data.map((d) => d.volume);
    const colors = data.map((d) =>
      d.close >= d.open ? "#ef5350" : "#26a69a"
    );

    const option = {
      animation: false,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "rgba(255,255,255,0.96)",
        borderColor: "#eee",
        textStyle: { color: "#333", fontSize: 12 },
        formatter: (params) => {
          const k = params.find((p) => p.seriesName === "K线");
          const v = params.find((p) => p.seriesName === "成交量");
          if (!k) return "";
          // ECharts v6 candlestick: k.data = [index, open, close, low, high]
          const raw = k.data;
          const [open, close, low, high] = raw.length > 4 ? raw.slice(1) : raw;
          const change = close - open;
          const pct = open ? ((change / open) * 100).toFixed(2) : "0.00";
          const color = change >= 0 ? "#ef5350" : "#26a69a";
          return `
            <div style="font-size:13px;line-height:1.8">
              <div style="font-weight:600;margin-bottom:2px">${k.axisValue}</div>
              <div>开盘 <b>${open}</b></div>
              <div>收盘 <b style="color:${color}">${close}</b></div>
              <div>最高 <b>${high}</b> &nbsp; 最低 <b>${low}</b></div>
              <div>涨跌 <span style="color:${color}">${change >= 0 ? "+" : ""}${change.toFixed(2)} (${pct}%)</span></div>
              ${v ? `<div>成交量 <b>${(v.data / 1e4).toFixed(0)}万</b></div>` : ""}
            </div>`;
        },
      },
      axisPointer: {
        link: [{ xAxisIndex: "all" }],
      },
      grid: [
        { left: 56, right: 20, top: 16, height: "58%" },
        { left: 56, right: 20, top: "78%", height: "16%" },
      ],
      xAxis: [
        {
          type: "category",
          data: dates,
          gridIndex: 0,
          axisLine: { lineStyle: { color: "#ddd" } },
          axisLabel: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
        {
          type: "category",
          data: dates,
          gridIndex: 1,
          axisLine: { lineStyle: { color: "#ddd" } },
          axisLabel: { fontSize: 11, color: "#999" },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          scale: true,
          gridIndex: 0,
          splitLine: { lineStyle: { color: "#f0f0f0" } },
          axisLabel: { fontSize: 11, color: "#999" },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        {
          scale: true,
          gridIndex: 1,
          splitLine: { show: false },
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
        },
      ],
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
        },
      ],
      series: [
        {
          name: "K线",
          type: "candlestick",
          data: ohlc,
          xAxisIndex: 0,
          yAxisIndex: 0,
          itemStyle: {
            color: "#ef5350",
            color0: "#26a69a",
            borderColor: "#ef5350",
            borderColor0: "#26a69a",
          },
        },
        {
          name: "成交量",
          type: "bar",
          data: volumes,
          xAxisIndex: 1,
          yAxisIndex: 1,
          itemStyle: {
            color: (params) => colors[params.dataIndex],
          },
          barMaxWidth: 8,
        },
      ],
    };

    chart.setOption(option);
  };

  const isUp = quote && quote.change >= 0;
  const currencyLabel = market === "A股" ? "¥" : (quote?.currency === "USD" ? "$" : quote?.currency || "$");

  return (
    <div className="market-panel">
      {/* 实时报价 */}
      <div className="quote-bar">
        <div className="quote-left">
          {quote ? (
            <>
              <span className={`quote-price ${isUp ? "up" : "down"}`}>
                {currencyLabel}{quote.price}
              </span>
              <span className={`quote-change ${isUp ? "up" : "down"}`}>
                {isUp ? "+" : ""}{quote.change}&nbsp;
                ({isUp ? "+" : ""}{quote.change_pct}%)
              </span>
            </>
          ) : (
            <span className="quote-price">--</span>
          )}
        </div>
        <button
          className="refresh-btn"
          onClick={fetchQuote}
          disabled={quoteLoading}
        >
          {quoteLoading ? "刷新中..." : "刷新报价"}
        </button>
      </div>

      {/* 报价明细 */}
      {quote && (
        <div className="quote-detail">
          <div><span className="qd-label">昨收</span><span>{currencyLabel}{quote.prev_close}</span></div>
          <div><span className="qd-label">今开</span><span>{currencyLabel}{quote.open}</span></div>
          <div><span className="qd-label">最高</span><span className="up">{currencyLabel}{quote.high}</span></div>
          <div><span className="qd-label">最低</span><span className="down">{currencyLabel}{quote.low}</span></div>
        </div>
      )}

      {/* 时间切换 */}
      <div className="period-bar">
        <span className="period-label">日K线</span>
        <div className="period-tabs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`period-btn ${period === p.key ? "active" : ""}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* K线图 */}
      <div className="chart-wrap">
        {klineLoading && <div className="chart-loading">加载中...</div>}
        <div ref={chartRef} className="chart-canvas" />
      </div>
    </div>
  );
}
