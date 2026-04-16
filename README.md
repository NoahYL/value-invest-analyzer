# Value Invest Analyzer

一个辅助**价值投资决策**的分析平台，而不是一个看行情的工具。

设计理念参考了段永平、纽约金冰等价值投资者的框架：**先看懂生意，再评估质量，最后估算价值**。K 线、分析师目标价、估值评分等短期/权威性信号被刻意移除，换成强迫你思考的框架。

支持 A 股（中国）和美股。

## 四大分析模块

| # | 模块 | 内容 |
|---|------|------|
| **01 公司画像** | 理解一门生意 | 行业 + 主营业务 + 收入构成 + **商业模式分层**（T1-T4 自评）+ **护城河雷达图**（5 维自评） |
| **02 财务质量** | 看赚钱能力 | 估值指标 (PE/PB/ROE) + 年报/季报经营数据 + **质量指标**（毛利率/净利率/**净利润含金量**/资产负债率）+ **10 年趋势图** + **财务红旗** |
| **03 价值估算** | 估算内在价值 | **DCF 三情境估值器**（悲观/中性/乐观，可交互调参）+ PEG + 格雷厄姆内在价值（作为经典公式参考） |
| **04 同行对比** | 横向定位 | 柱状图 + 对比表格（PE/PB/PS/ROE/市值） |

### 核心特色

- 🎯 **DCF 三情境**：自动预填 FCF 和股本，可调前 5 年/中期/永续增速 + 折现率，实时算每股内在价值和安全边际。真正作用是**看出"当前股价隐含了多乐观的预期"**。
- 🏰 **护城河雷达图**：品牌/网络效应/成本优势/转换成本/无形资产 5 维滑块自评，按股票代码本地持久化。
- 📊 **商业模式分层**：T1 顶级 / T2 优秀 / T3 一般 / T4 回避，每层带判断标准，防止"拍脑袋"。
- 💰 **净利润含金量** = 经营现金流 / 净利润，段永平最爱看的指标之一。≥90% 说明赚的钱真的到账了。
- 📈 **10 年历史趋势**：A 股 12+ 年年报数据，美股 4-5 年（可切换营收/净利润/净利率/ROE）。
- 🚩 **高置信度财务红旗**：含金量<70% / 资产负债率>70% / 净利率连续下滑（累计 >3 个百分点）。

### 刻意没做的事

为保持"价值投资"的纯度，本项目**不做**：
- K 线图、日内波动、分时行情（短期信号对长期决策无帮助）
- 券商目标价 / 分析师评级（权威性陷阱）
- 估值评分 0-100（加权打分是伪科学）
- 概念板块标签（短期炒作信号）
- ROIC 计算（需估税率，易算错）
- 应收账款/存货勾稽红旗（美股 yfinance 数据稀疏不可靠）

## 技术栈

| 层 | 技术 |
|----|------|
| Frontend | React 19 + Vite + ECharts 6 |
| Backend | Python FastAPI |
| A 股数据 | AKShare + Eastmoney APIs (via curl_cffi) |
| 美股数据 | yfinance |
| 翻译 | deep-translator (Google) |
| 本地持久化 | localStorage（按股票代码存商业模式/护城河/DCF 假设） |

## 快速开始

### 1. 后端

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 启动（端口 8000）
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. 前端

```bash
cd frontend

# 安装依赖
npm install

# 开发模式（端口 5173）
npm run dev
```

浏览器打开 http://localhost:5173。

## 项目结构

```
value-invest-analyzer/
├── backend/
│   ├── main.py                      # FastAPI 应用，路由
│   ├── requirements.txt             # Python 依赖
│   └── services/
│       ├── stock_identifier.py      # 市场识别（A股/美股/名称）
│       ├── ashare_service.py        # A股公司信息 + 主营收入
│       ├── us_stock_service.py      # 美股信息（yfinance）
│       ├── market_service.py        # 实时报价
│       ├── valuation_service.py     # 经典公式估值（PEG/格雷厄姆）
│       ├── comparison_service.py    # 行业同行对比
│       └── quality_service.py       # 财务质量 + 趋势 + 红旗 + DCF 基础数据
└── frontend/
    ├── src/
    │   ├── App.jsx                  # 主应用、4 大模块布局
    │   ├── App.css                  # 全局样式
    │   └── components/
    │       ├── MarketPanel.jsx      # 现价（精简版）
    │       ├── BusinessModelTag.jsx # 商业模式分层（T1-T4）
    │       ├── MoatRadar.jsx        # 护城河 5 维雷达图自评
    │       ├── QualityPanel.jsx     # 质量指标 + 红旗 + 10 年趋势图
    │       ├── DCFPanel.jsx         # DCF 三情境估值器
    │       ├── ValuationPanel.jsx   # PEG + 格雷厄姆（经典公式参考）
    │       └── ComparisonPanel.jsx  # 同行对比
    ├── package.json
    └── vite.config.js
```

## API 端点

| Endpoint | 说明 |
|----------|------|
| `GET /api/search?q=` | 按代码或名称搜股票 |
| `GET /api/quote?code=&market=` | 实时报价 |
| `GET /api/quality?code=&market=` | 10 年财务质量 + 红旗 + DCF 基础数据 |
| `GET /api/valuation?code=&market=` | 经典公式估值（PEG/格雷厄姆） |
| `GET /api/comparison?code=&market=` | 行业同行对比 |

## 使用建议（段永平式流程）

1. 搜索一家公司
2. 先看**财务质量**：如果含金量 < 70% 或毛利率 < 15%，大概率不值得深究
3. 到**公司画像**：强制自问"这是什么级别的生意"（T1-T4）+ "凭什么它能持续赚钱"（护城河 5 维）
4. 回到**价值估算**：用 DCF 三情境调参数——如果要**乐观情境**才撑得住当前股价，说明市场对它预期已经很高
5. 决策门槛：T1/T2 + 宽护城河 + 中性情境安全边际 > 30% 才考虑

## 免责声明

本工具仅用于辅助分析和思考，不构成任何投资建议。所有数据来自公开接口，仅供参考；估值结果高度依赖假设，不代表真实股价。

## License

MIT
