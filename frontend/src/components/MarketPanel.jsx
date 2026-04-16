import { useState, useEffect } from "react";
import axios from "axios";
import "./MarketPanel.css";

const API_BASE = "http://localhost:8000";

export default function MarketPanel({ code, market }) {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchQuote = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/quote`, {
        params: { code, market },
      });
      if (res.data.status === "ok") setQuote(res.data.data);
    } catch (e) {
      if (!axios.isCancel(e)) console.error("Quote fetch error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, market]);

  const isUp = quote && quote.change >= 0;
  const currencyLabel =
    market === "A股" ? "¥" : quote?.currency === "USD" ? "$" : quote?.currency || "$";

  return (
    <div className="quote-inline">
      {quote ? (
        <>
          <span className={`quote-price ${isUp ? "up" : "down"}`}>
            {currencyLabel}
            {quote.price}
          </span>
          <span className={`quote-change ${isUp ? "up" : "down"}`}>
            {isUp ? "+" : ""}
            {quote.change}&nbsp;({isUp ? "+" : ""}
            {quote.change_pct}%)
          </span>
        </>
      ) : (
        <span className="quote-price">--</span>
      )}
      <button className="refresh-btn" onClick={fetchQuote} disabled={loading}>
        {loading ? "刷新中..." : "刷新"}
      </button>
    </div>
  );
}
