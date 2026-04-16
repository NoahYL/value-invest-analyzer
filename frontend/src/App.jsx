import { useState } from "react";
import axios from "axios";
import MarketPanel from "./components/MarketPanel";
import ValuationPanel from "./components/ValuationPanel";
import ComparisonPanel from "./components/ComparisonPanel";
import QualityPanel from "./components/QualityPanel";
import BusinessModelTag from "./components/BusinessModelTag";
import MoatRadar from "./components/MoatRadar";
import DCFPanel from "./components/DCFPanel";
import "./App.css";

const API_BASE = "http://localhost:8000";

function formatIncome(val) {
  if (val >= 100) return `${(val / 100).toFixed(0)} 百亿`;
  if (val >= 1) return `${val.toFixed(2)} 亿`;
  return `${(val * 1e4).toFixed(0)} 万`;
}

function formatMoney(val, currency) {
  if (val == null) return null;
  if (currency && currency !== "CNY") {
    const abs = Math.abs(val);
    const sign = val < 0 ? "-" : "";
    const sym = currency === "USD" ? "$" : currency + " ";
    if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)} 万亿`;
    if (abs >= 1e8) return `${sign}${sym}${(abs / 1e8).toFixed(2)} 亿`;
    if (abs >= 1e4) return `${sign}${sym}${(abs / 1e4).toFixed(0)} 万`;
    return `${sign}${sym}${abs.toFixed(0)}`;
  }
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} 万亿`;
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)} 万`;
  return `${sign}${abs.toFixed(0)}`;
}

function formatRatio(val) {
  if (val == null) return null;
  return `${Number(val).toFixed(2)}`;
}

function formatPercent(val) {
  if (val == null) return null;
  return `${Number(val).toFixed(2)}%`;
}

function ModuleHeader({ num, title, subtitle }) {
  return (
    <div className="module-header">
      <span className="module-num">{num}</span>
      <div className="module-title-wrap">
        <h2 className="module-title">{title}</h2>
        {subtitle && <p className="module-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}

function App() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await axios.get(`${API_BASE}/api/search`, { params: { q } });
      if (res.data.status === "ok") {
        setResult(res.data);
      } else {
        setError(res.data.message);
      }
    } catch (err) {
      setError("请求失败，请检查后端服务是否启动");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const renderStockInfo = (data) => {
    const topRevenue = (data.revenue || []).filter((r) => r.name !== "其他");
    const mostProfitable = topRevenue.length
      ? [...topRevenue].sort((a, b) => b.gross_margin - a.gross_margin)[0]
      : null;

    return (
      <>
        {/* 头部：名称 + 代码 + 市场 + 现价 */}
        <div className="stock-card stock-header-card">
          <div className="stock-header">
            <span className="stock-name">{data.name}</span>
            <span className="stock-code">{data.code}</span>
            <span
              className={`stock-market ${
                data.market === "A股" ? "a-share" : "us-stock"
              }`}
            >
              {data.market}
            </span>
            <MarketPanel code={data.code} market={data.market} />
          </div>
        </div>

        {/* ===== 模块 1：公司画像 ===== */}
        <div className="stock-card module-card">
          <ModuleHeader
            num="01"
            title="公司画像"
            subtitle="先看懂一门生意，再考虑它的价格。"
          />
          <div className="stock-details">
            <div className="detail-row">
              <span className="label">行业</span>
              <span className="value">{data.industry || "暂无数据"}</span>
            </div>
            <div className="detail-row">
              <span className="label">主营业务</span>
              <span className="value business">
                {data.business || "暂无数据"}
              </span>
            </div>
          </div>

          {/* 商业模式分层 */}
          <div className="section">
            <BusinessModelTag code={data.code} />
          </div>

          {/* 护城河自评 */}
          <div className="section">
            <MoatRadar code={data.code} />
          </div>

          {topRevenue.length > 0 && (
            <div className="section">
              <h3 className="section-title">收入构成</h3>
              {mostProfitable && (
                <div className="highlight-box">
                  <span className="highlight-icon">&#9733;</span>
                  最赚钱的业务：<strong>{mostProfitable.name}</strong>
                  （毛利率 {mostProfitable.gross_margin}%，收入占比{" "}
                  {mostProfitable.ratio}%）
                </div>
              )}
              <div className="revenue-table">
                <div className="rev-header">
                  <span className="rev-cell name">业务板块</span>
                  <span className="rev-cell num">收入(亿)</span>
                  <span className="rev-cell num">占比</span>
                  <span className="rev-cell num">毛利率</span>
                  <span className="rev-cell bar-col">占比</span>
                </div>
                {topRevenue.map((r) => (
                  <div key={r.name} className="rev-row">
                    <span className="rev-cell name">{r.name}</span>
                    <span className="rev-cell num">
                      {formatIncome(r.income)}
                    </span>
                    <span className="rev-cell num">{r.ratio}%</span>
                    <span
                      className={`rev-cell num ${
                        r.gross_margin >= 30
                          ? "high-margin"
                          : r.gross_margin >= 15
                          ? "mid-margin"
                          : "low-margin"
                      }`}
                    >
                      {r.gross_margin}%
                    </span>
                    <span className="rev-cell bar-col">
                      <span
                        className="bar"
                        style={{ width: `${Math.min(r.ratio, 100)}%` }}
                      ></span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===== 模块 2：财务质量 ===== */}
        {data.financials && (
          <div className="stock-card module-card">
            <ModuleHeader
              num="02"
              title="财务质量"
              subtitle="好生意会体现在赚钱能力、现金流和资本回报上。"
            />

            <h3 className="section-title">
              估值指标
              <span className="report-tag">实时</span>
            </h3>
            <div className="fin-grid">
              {[
                {
                  label: "PE (市盈率·TTM)",
                  value: formatRatio(data.financials.pe),
                  color:
                    data.financials.pe != null && data.financials.pe < 20
                      ? "green"
                      : data.financials.pe != null && data.financials.pe > 50
                      ? "red"
                      : "",
                },
                {
                  label: "PB (市净率·MRQ)",
                  value: formatRatio(data.financials.pb),
                  color:
                    data.financials.pb != null && data.financials.pb < 1.5
                      ? "green"
                      : data.financials.pb != null && data.financials.pb > 8
                      ? "red"
                      : "",
                },
                {
                  label: "ROE (净资产收益率)",
                  value: formatPercent(data.financials.roe),
                  color:
                    data.financials.roe != null && data.financials.roe > 15
                      ? "green"
                      : data.financials.roe != null && data.financials.roe < 5
                      ? "red"
                      : "",
                },
              ].map((item) => (
                <div key={item.label} className="fin-card">
                  <div className="fin-label">{item.label}</div>
                  <div className={`fin-value ${item.color || ""}`}>
                    {item.value ?? "暂无数据"}
                  </div>
                </div>
              ))}
            </div>

            <h3 className="section-title" style={{ marginTop: 16 }}>
              经营数据
              {data.financials.report_name && (
                <span className="report-tag">
                  {data.financials.report_name}
                </span>
              )}
            </h3>
            <div className="fin-grid">
              {[
                {
                  label: "总营收",
                  value: formatMoney(
                    data.financials.revenue,
                    data.financials.currency
                  ),
                },
                {
                  label: "净利润",
                  value: formatMoney(
                    data.financials.net_profit,
                    data.financials.currency
                  ),
                  color:
                    data.financials.net_profit != null &&
                    data.financials.net_profit > 0
                      ? "green"
                      : "red",
                },
                {
                  label: "经营现金流",
                  value: formatMoney(
                    data.financials.cashflow,
                    data.financials.currency
                  ),
                  color:
                    data.financials.cashflow != null &&
                    data.financials.cashflow > 0
                      ? "green"
                      : "red",
                },
              ].map((item) => (
                <div key={item.label} className="fin-card">
                  <div className="fin-label">{item.label}</div>
                  <div className={`fin-value ${item.color || ""}`}>
                    {item.value ?? "暂无数据"}
                  </div>
                </div>
              ))}
            </div>

            {data.financials.latest_report_name && (
              <>
                <h3 className="section-title" style={{ marginTop: 16 }}>
                  最新进度
                  <span className="report-tag">
                    {data.financials.latest_report_name}
                  </span>
                </h3>
                <div className="fin-grid">
                  {[
                    {
                      label: "总营收",
                      value: formatMoney(
                        data.financials.latest_revenue,
                        data.financials.currency
                      ),
                    },
                    {
                      label: "净利润",
                      value: formatMoney(
                        data.financials.latest_net_profit,
                        data.financials.currency
                      ),
                      color:
                        data.financials.latest_net_profit != null &&
                        data.financials.latest_net_profit > 0
                          ? "green"
                          : "red",
                    },
                    {
                      label: "经营现金流",
                      value: formatMoney(
                        data.financials.latest_cashflow,
                        data.financials.currency
                      ),
                      color:
                        data.financials.latest_cashflow != null &&
                        data.financials.latest_cashflow > 0
                          ? "green"
                          : "red",
                    },
                  ].map((item) => (
                    <div key={item.label} className="fin-card">
                      <div className="fin-label">{item.label}</div>
                      <div className={`fin-value ${item.color || ""}`}>
                        {item.value ?? "暂无数据"}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 质量指标 + 红旗 + 10年趋势 */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
              <QualityPanel code={data.code} market={data.market} />
            </div>
          </div>
        )}

        {/* ===== 模块 3：价值估算 ===== */}
        <div className="stock-card module-card">
          <ModuleHeader
            num="03"
            title="价值估算"
            subtitle="估值只是参考，真正的安全边际来自对生意的理解。"
          />

          {/* DCF 三情境 */}
          <h3 className="section-title" style={{ border: "none", marginBottom: 10 }}>
            DCF 三情境估值
            <span className="report-tag">你的假设</span>
          </h3>
          <DCFPanel code={data.code} market={data.market} />

          {/* PEG + 格雷厄姆（简易参考） */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
            <h3 className="section-title" style={{ border: "none", marginBottom: 10 }}>
              经典公式参考
            </h3>
            <ValuationPanel code={data.code} market={data.market} />
          </div>
        </div>

        {/* ===== 模块 4：同行对比 ===== */}
        <div className="stock-card module-card">
          <ModuleHeader
            num="04"
            title="同行对比"
            subtitle="横向参考，帮助定位——估值高低不等于投资机会。"
          />
          <ComparisonPanel code={data.code} market={data.market} />
        </div>
      </>
    );
  };

  const renderList = (items) => (
    <div className="stock-list">
      <p className="list-hint">找到以下匹配股票，点击查看详情：</p>
      {items.map((item) => (
        <div
          key={item.code}
          className="stock-list-item"
          onClick={() => {
            setQuery(item.code);
            setTimeout(() => {
              document.querySelector(".search-btn")?.click();
            }, 0);
          }}
        >
          <span className="item-code">{item.code}</span>
          <span className="item-name">{item.name}</span>
          <span
            className={`stock-market ${
              item.market === "A股" ? "a-share" : "us-stock"
            }`}
          >
            {item.market}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="app">
      <h1 className="title">价值投资分析平台</h1>
      <p className="subtitle">理解生意、评估质量、估算价值——辅助你做长期决策</p>

      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="A股代码(600519) / 美股代码(PDD) / 公司名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="search-btn"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? "搜索中..." : "搜索"}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {result && (
        <div className="result-area">
          {result.type === "list"
            ? renderList(result.data)
            : renderStockInfo(result.data)}
        </div>
      )}
    </div>
  );
}

export default App;
