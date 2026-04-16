import { Fragment, useEffect, useState } from "react";
import axios from "axios";
import { matchHandbook, SECTION_META } from "../data/matchHandbook";
import "./IndustryHandbook.css";

const API_BASE = "http://localhost:8000";

/** 把手册里 benchmark 的「指标」中文名映射到 API 的 metric key */
function metricKeyFromLabel(label) {
  const l = (label || "").toLowerCase();
  if (l.includes("毛利")) return "gross_margin";
  if (l.includes("净利") || l.includes("销售利润率")) return "net_margin";
  if (l.includes("roe") || l.includes("净资产收益")) return "roe";
  if (l.includes("负债")) return "debt_ratio";
  return null;
}

function fmtPercent(v) {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

// 段落配置：title + key + 图标
const SECTIONS = [
  { key: "essence", title: "这门生意的本质", icon: "◆" },
  { key: "valueChain", title: "产业链位置", icon: "⇄" },
  { key: "drivers", title: "驱动因素", icon: "▲" },
  { key: "benchmark", title: "财务 Benchmark", icon: "▤" },
  { key: "cycle", title: "周期位置", icon: "◷" },
  { key: "checklist", title: "必问的问题", icon: "☑" },
  { key: "peers", title: "对标公司", icon: "◎" },
  { key: "redFlags", title: "红旗预警", icon: "⚑" },
  { key: "aiImpact", title: "AI / 新趋势影响", icon: "✦" },
];

/**
 * 内联富文本渲染器，支持两种语法：
 *   **粗体**         → <strong>
 *   {{时点/来源}}    → <span.ih-src-tag>  (小灰色胶囊，标注数据时点)
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
        <span key={j} className="ih-src-tag" title="数据时点 / 来源">
          {p.slice(2, -2)}
        </span>
      );
    }
    return <span key={j}>{p}</span>;
  });
}

function renderEssence(lines) {
  return (
    <ul className="ih-essence-list">
      {lines.map((line, i) => (
        <li key={i}>{renderInline(line)}</li>
      ))}
    </ul>
  );
}

function renderValueChain(vc) {
  return (
    <div className="ih-valuechain">
      <div className="ih-vc-row">
        <span className="ih-vc-label">上游</span>
        <span className="ih-vc-content">{renderInline(vc.upstream)}</span>
      </div>
      <div className="ih-vc-arrow">↓</div>
      <div className="ih-vc-row ih-vc-company">
        <span className="ih-vc-label">本公司</span>
        <span className="ih-vc-content">{renderInline(vc.company)}</span>
      </div>
      <div className="ih-vc-arrow">↓</div>
      <div className="ih-vc-row">
        <span className="ih-vc-label">下游</span>
        <span className="ih-vc-content">{renderInline(vc.downstream)}</span>
      </div>
    </div>
  );
}

function renderDrivers(d) {
  return (
    <div className="ih-drivers">
      <div className="ih-drivers-block">
        <div className="ih-drivers-label">
          长期
          <span className="ih-shelflife ih-shelflife-stable" title="3-5 年相对稳定">稳定</span>
        </div>
        <ul>
          {(d.longTerm || []).map((x, i) => (
            <li key={i}>{renderInline(x)}</li>
          ))}
        </ul>
      </div>
      <div className="ih-drivers-block">
        <div className="ih-drivers-label">
          短期催化
          <span className="ih-shelflife ih-shelflife-volatile" title="6-12 月变化快，需自行核对最新新闻/政策">易变</span>
        </div>
        <ul>
          {(d.shortTerm || []).map((x, i) => (
            <li key={i}>{renderInline(x)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function renderBenchmark(rows, calibration) {
  const metrics = calibration?.metrics || {};
  const asOf = calibration?.asOf;
  const N = (calibration?.peers_used || []).length;

  return (
    <div className="ih-benchmark-wrap">
      <table className="ih-benchmark">
        <thead>
          <tr>
            <th>指标</th>
            <th className="col-ok">优秀</th>
            <th className="col-mid">一般</th>
            <th className="col-warn">警戒</th>
            <th className="col-note">备注</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const key = metricKeyFromLabel(r.metric);
            const calib = key ? metrics[key] : null;
            const hasCalib = calib && !calib.insufficient;
            return (
              <Fragment key={i}>
                <tr>
                  <td className="col-metric">{r.metric}</td>
                  <td className="col-ok">{r.excellent}</td>
                  <td className="col-mid">{r.average}</td>
                  <td className="col-warn">{r.warning}</td>
                  <td className="col-note">{renderInline(r.note)}</td>
                </tr>
                {hasCalib && (
                  <tr className="ih-benchmark-calib">
                    <td className="col-metric">
                      <span className="ih-calib-tag" title="从同行实际财报算的分位数">
                        实际同行
                      </span>
                    </td>
                    <td className="col-ok">P75 {fmtPercent(calib.p75)}</td>
                    <td className="col-mid">P50 {fmtPercent(calib.p50)}</td>
                    <td className="col-warn">P25 {fmtPercent(calib.p25)}</td>
                    <td className="col-note calib-note">
                      {calib.samples?.slice(0, 3).map((s, j) => (
                        <span key={j} className="ih-calib-sample">
                          {s.name} {fmtPercent(s.value)}
                        </span>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {calibration && (
        <div className="ih-benchmark-meta">
          {N > 0 ? (
            <>
              📊 自动校准自 <b>{N}</b> 家同行
              {asOf && <> · 数据截至 {asOf}</>}
              {(calibration.peers_skipped || []).length > 0 && (
                <span className="ih-calib-skipped">
                  （{calibration.peers_skipped.length} 家未获取：
                  {calibration.peers_skipped
                    .slice(0, 3)
                    .map((p) => p.code)
                    .join(" / ")}
                  {calibration.peers_skipped.length > 3 ? " ..." : ""}
                  ）
                </span>
              )}
            </>
          ) : (
            <>📊 暂无可用同行数据进行校准</>
          )}
        </div>
      )}
    </div>
  );
}

function renderMarkdownLite(text) {
  // 换行分段 + 内联（**bold** / {{tag}}）
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <div key={i} className="ih-cycle-line">{renderInline(line)}</div>
  ));
}

function renderChecklist(items) {
  return (
    <ol className="ih-checklist">
      {items.map((x, i) => (
        <li key={i}>{renderInline(x)}</li>
      ))}
    </ol>
  );
}

function renderPeers(peers) {
  return (
    <div className="ih-peers-wrap">
      <table className="ih-peers">
        <thead>
          <tr>
            <th>公司</th>
            <th>代码</th>
            <th>定位</th>
            <th>护城河 / 特点</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {peers.map((p, i) => (
            <tr key={i}>
              <td className="peer-name">{p.name}</td>
              <td className="peer-code">{p.code}</td>
              <td className="peer-tier">{renderInline(p.tier)}</td>
              <td className="peer-moat">{renderInline(p.moat)}</td>
              <td className="peer-note">{renderInline(p.note)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderRedFlags(flags) {
  return (
    <ul className="ih-redflags">
      {flags.map((x, i) => (
        <li key={i}>{renderInline(x)}</li>
      ))}
    </ul>
  );
}

export default function IndustryHandbook({ code, industry }) {
  const [expanded, setExpanded] = useState(false);
  const [calibration, setCalibration] = useState(null);
  const [calibLoaded, setCalibLoaded] = useState(false);
  const hb = matchHandbook(code, industry);

  // 展开后懒加载 benchmark 校准数据
  useEffect(() => {
    if (!expanded || !hb || calibLoaded) return;
    const peerCodes = (hb.peers || [])
      .map((p) => p.code)
      .filter((c) => /^\d{6}$/.test(c) || /^[A-Za-z]+$/.test(c)); // 只传 A股/美股，其它跳过
    if (peerCodes.length < 3) {
      setCalibLoaded(true);
      return;
    }
    axios
      .get(`${API_BASE}/api/benchmark`, { params: { codes: peerCodes.join(",") } })
      .then((res) => {
        if (res.data.status === "ok") setCalibration(res.data.data);
      })
      .catch((e) => console.warn("Benchmark calibration failed:", e))
      .finally(() => setCalibLoaded(true));
  }, [expanded, hb, calibLoaded]);

  if (!hb) return null;

  const summary = Array.isArray(hb.essence) ? hb.essence[0] : hb.essence;

  return (
    <div className="ih-panel">
      <div
        className={`ih-head ${expanded ? "expanded" : ""}`}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <div className="ih-head-left">
          <div className="ih-badge">
            行业手册
            {hb.matchType === "code" && <span className="ih-match-tag">精准匹配</span>}
            {hb.matchType === "industry" && <span className="ih-match-tag">行业匹配</span>}
            {hb.lastUpdated && (
              <span className="ih-updated-tag" title="手册内容的最后更新时间，请注意部分版块有保质期">
                更新于 {hb.lastUpdated}
              </span>
            )}
          </div>
          <div className="ih-head-title">
            <h3>{hb.name}</h3>
            <p className="ih-subtitle">{hb.subtitle}</p>
            {!expanded && summary && (
              <p className="ih-summary">{summary}</p>
            )}
          </div>
        </div>
        <div className="ih-toggle">
          {expanded ? "收起 ▲" : "展开 ▼"}
        </div>
      </div>

      {expanded && (
        <div className="ih-body">
          {/* 保质期图例 */}
          <div className="ih-legend">
            <span className="ih-legend-title">保质期说明：</span>
            <span className="ih-shelflife ih-shelflife-permanent">永久</span>
            方法论，永不过时
            <span className="ih-legend-sep">·</span>
            <span className="ih-shelflife ih-shelflife-stable">稳定</span>
            3-10 年基本不变
            <span className="ih-legend-sep">·</span>
            <span className="ih-shelflife ih-shelflife-medium">参考</span>
            2-3 年量级参考
            <span className="ih-legend-sep">·</span>
            <span className="ih-shelflife ih-shelflife-volatile">易变</span>
            6-12 月需自行核对
          </div>

          {SECTIONS.map((sec) => {
            const v = hb[sec.key];
            if (!v) return null;

            let content = null;
            if (sec.key === "essence") content = renderEssence(v);
            else if (sec.key === "valueChain") content = renderValueChain(v);
            else if (sec.key === "drivers") content = renderDrivers(v);
            else if (sec.key === "benchmark") content = renderBenchmark(v, calibration);
            else if (sec.key === "cycle") content = renderMarkdownLite(v);
            else if (sec.key === "checklist") content = renderChecklist(v);
            else if (sec.key === "peers") content = renderPeers(v);
            else if (sec.key === "redFlags") content = renderRedFlags(v);
            else if (sec.key === "aiImpact") content = renderMarkdownLite(v);

            const meta = SECTION_META[sec.key];
            const tier = meta?.tier || "medium";

            return (
              <section key={sec.key} className="ih-section">
                <h4 className="ih-section-title">
                  <span className="ih-section-icon">{sec.icon}</span>
                  {sec.title}
                  {meta && (
                    <span
                      className={`ih-shelflife ih-shelflife-${tier}`}
                      title={meta.hint}
                    >
                      {meta.label}
                    </span>
                  )}
                </h4>
                <div className="ih-section-body">{content}</div>
              </section>
            );
          })}

          {/* 底部说明 */}
          <div className="ih-disclaimer">
            手册内容由 AI 基于公开资料 + 价值投资框架整理，仅作思考辅助。
            <strong>具体数值（PE / ROE / 价格 / 产量）以模块 2、4 实时数据为准；
            对时效敏感的「易变」版块建议交叉验证最新新闻。</strong>
          </div>
        </div>
      )}
    </div>
  );
}
