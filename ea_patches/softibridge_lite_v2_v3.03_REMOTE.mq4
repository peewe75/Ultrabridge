#property strict
// ================================
// SoftiBridge EA V_3.0.3 (LITE)
// - AUTO market/pending (threshold_pips)
// - Risk% sizing + micro-lots + TP1/TP2/TP3
// - Broker stopLevel check (optional adjust)
// - Market closed / trade disabled -> WAIT + retry
// - WriteResult retry (reduces err=5004 issues)
// - FIX: SHORTHAND (Format 2) handled independently from PIPS/PRICE (no TP3 forcing)
// - FIX: Queue path fallback (COMMON -> LOCAL) for backward compatibility
// - FIX: Stronger symbol resolve (prefer chart symbol when broker uses suffix like XAUUSD.p)
// ================================

// Queue path (COMMON is canonical; LOCAL is backward-compatible with older installs)
string QUEUE_FILE = "softibridge/inbox/cmd_queue.txt";      // COMMON

// --- Transparent execution log context (GLOBAL)
string g_ctx_symbol = "";
string g_ctx_side = "";
double g_ctx_signal_price = 0.0;
double g_ctx_req_price = 0.0;
int    g_ctx_spread_pts = 0;
int    g_ctx_dev_pts = 0;
string g_ctx_comment = "";
string QUEUE_FILE_LOCAL = "softibridge/inbox/cmd_queue.txt"; // LOCAL (Terminal/MQL4/Files)
string OUTBOX_DIR = "softibridge/outbox";
string LOG_FILE   = "softibridge/logs/ea_events.log";

input double RiskPercent = 0.5;
input int    DefaultThresholdPips = 5;
input int    DefaultTP1_Pips = 50;
input int    DefaultTP2_Pips = 70;
input int    DefaultTP3_Pips = 100;

input double MaxSpreadPips = 35.0;   // Max spread filter in PIPS (0=disable). For XAU 35 pips = 350 points on 2/3-digit quotes
input int    MaxSpreadPoints = 0;    // (legacy/override) Max spread in POINTS. If >0 it overrides MaxSpreadPips
input bool   SpreadCompensation = true; // auto widen threshold by current spread
input double SpreadExtraPips   = 0.0;   // extra margin added to current spread when widening threshold

input bool   AutoAdjustStops = false;
input int    StopBufferPips  = 2;

input bool   UseSignalSL     = true;   // kept for compatibility (default behavior uses signal SL)
input bool   UseFixedSL      = false;
input int    FixedSL_Pips    = 120;
input bool   UseSLMultiplier = false;
input double SL_Multiplier   = 1.0;
input int    SL_ExtraPips    = 0;

input int    RetrySecondsWhenClosed = 60;

input int    MAGIC = 310126;
input int    SLIPPAGE = 20;

// ===== UI PANEL (v2) =====
input bool   UIPanelEnabled = true;
input double StepPrice      = 0.10;   // +/- step for Target/SL price
input int    MoveSL_Pips_UI = 10;     // used by MOVE SL button
input int    BE_MinPoints   = 100;    // BE only if >= 100 points in profit
input int    BE_OffsetPoints= 15;     // small buffer to avoid instant stop by spread

// --- runtime (do not modify inputs at runtime) ---
int    g_MaxSpreadPoints = 0;
double g_MaxSpreadPips   = 0.0;
// ===== Pip/Point helpers (supports 2/3/4/5-digit symbols; for XAU 2/3 digits => 1 pip = 10 points) =====
int SB_PipFactor(const string sym)
{
   int d = (int)MarketInfo(sym, MODE_DIGITS);
   // 5-digit FX, 3-digit JPY pairs, and 2/3-digit metals (XAU) commonly use 1 pip = 10 points
   if(d==5 || d==3 || d==2) return 10;
   return 1;
}
double SB_PipSize(const string sym)
{
   return MarketInfo(sym, MODE_POINT) * SB_PipFactor(sym);
}
int SB_PipsToPoints(const string sym, const double pips)
{
   return (int)MathRound(pips * SB_PipFactor(sym));
}

// Convert broker POINTS (e.g., MarketInfo(sym, MODE_SPREAD)) into PIPS using auto pip/point factor.
// Example (XAUUSD, 2 digits): MODE_SPREAD=350 points -> 35 pips (pipFactor=10).
double SB_PointsToPips(const string sym, const double points)
{
   double pf = (double)SB_PipFactor(sym);
   if(pf <= 0.0) pf = 1.0;
   return points / pf;
}
double SB_PipsToPrice(const string sym, const double pips)
{
   return pips * SB_PipSize(sym);
}
double SB_SpreadPipsNow(const string sym)
{
   double spreadPts = MarketInfo(sym, MODE_SPREAD);
   return spreadPts / SB_PipFactor(sym);
}




string last_id = "";
string BuildComment(string id, string tp){ return "SoftiBridge|"+id+"|"+tp; }
string wait_id = "";
datetime wait_next_retry = 0;

string Trim(string s){ return StringTrimLeft(StringTrimRight(s)); }
string LongToString(long v){ return IntegerToString((int)v); }

double PipSize(string symbol)
{
   double pointSize = MarketInfo(symbol, MODE_POINT);
   int digits   = (int)MarketInfo(symbol, MODE_DIGITS);
   // Forex 5/3-digit quotes: 1 pip = 10 points
   if(digits == 5 || digits == 3) return Point * 10.0;

   // Metals are commonly quoted with 2 digits but signals are in "pips" where
   // 1 pip = 10 points (0.10) for XAU/XAG.
   string su = UpperASCII(symbol);
   if(digits == 2 || digits == 4)
   {
      if(StringFind(su, "XAU") == 0 || StringFind(su, "XA") == 0 || StringFind(su, "XAG") == 0)
         return Point * 10.0;
   }

   return Point;
}

// --- Persistent last_id to avoid duplicate execution after restart
string STATE_LAST_ID_FILE = "softibridge/state/ea_last_id.txt";

// --- Queue open warn throttling
int last_queue_warn_ts = 0;
int last_queue_warn_err = -1;

string UpperASCII(string s)
{
   int n = StringLen(s);
   for(int i=0;i<n;i++)
   {
      int c = StringGetChar(s, i);
      if(c >= 97 && c <= 122) // a-z
         s = StringSetChar(s, i, (ushort)(c - 32));
   }
   return s;
}

string ResolveSymbol(string requested)
{
   requested = Trim(requested);
   if(requested == "") return Symbol();

   // If broker uses suffixes (e.g., XAUUSD.p) and EA is attached to that chart,
   // prefer the chart symbol when it matches the requested base (keeps legacy behavior).
   string chart = Symbol();
   string baseReq = requested;
   int dot0 = StringFind(baseReq, ".");
   if(dot0 > 0) baseReq = StringSubstr(baseReq, 0, dot0);
   baseReq = UpperASCII(baseReq);
   string chartU = UpperASCII(chart);
   if(StringFind(chartU, baseReq) == 0) return chart;

   // if it's already valid, use it
   if(MarketInfo(requested, MODE_POINT) > 0) return requested;

   // base without suffix
   string base = requested;
   int dot = StringFind(base, ".");
   if(dot > 0) base = StringSubstr(base, 0, dot);
   base = UpperASCII(base);

   int total = SymbolsTotal(true);
   for(int i=0;i<total;i++)
   {
      string s = SymbolName(i, true);
      string su = UpperASCII(s);
      if(StringFind(su, base) == 0) return s; // starts with
   }
   for(int j=0;j<total;j++)
   {
      string s2 = SymbolName(j, true);
      string su2 = UpperASCII(s2);
      if(StringFind(su2, base) >= 0) return s2; // contains
   }
   return Symbol();
}

void LoadLastId()
{
   int h = FileOpen(STATE_LAST_ID_FILE, FILE_READ|FILE_TXT|FILE_COMMON);
   if(h == INVALID_HANDLE) return;
   string s = FileReadString(h);
   FileClose(h);
   s = Trim(s);
   if(s != "") last_id = s;
}

void SaveLastId()
{
   int h = FileOpen(STATE_LAST_ID_FILE, FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(h == INVALID_HANDLE) return;
   FileWrite(h, last_id);
   FileClose(h);
}

// Convert shorthand like 80 -> 4880 based on current price (base = floor(price/100)*100)
double ShorthandToPrice(string symbol, int shortVal)
{
   double px = MarketInfo(symbol, MODE_BID);
   if(px <= 0) px = MarketInfo(symbol, MODE_ASK);
   if(px <= 0) return 0.0;
   double base = MathFloor(px / 100.0) * 100.0;
   return base + (double)shortVal;
}

bool ExecutePRICE(string symbol, string side,
                  double entry_lo, double entry_hi,
                  double sl_price,
                  double tp1_price, double tp2_price, double tp3_price,
                  int threshold_pips,
                  string &out_msg)
{
   if(entry_lo <= 0 || entry_hi <= 0 || sl_price <= 0)
   {
      out_msg = "BAD_PRICE_FIELDS";
      return(false);
   }

   double entry = (entry_lo + entry_hi) / 2.0;
   double pip = PipSize(symbol);
   if(pip <= 0) { out_msg = "PIPSIZE_ZERO"; return(false); }

   int sl_pips = (int)MathRound(MathAbs(entry - sl_price) / pip);
   if(sl_pips <= 0) { out_msg = "SL_PIPS_ZERO"; return(false); }

   int tp1_pips = 0, tp2_pips = 0, tp3_pips = 0;

   if(tp1_price > 0)
   {
      if(side == "BUY") tp1_pips = (int)MathRound(MathAbs(tp1_price - entry) / pip);
      else             tp1_pips = (int)MathRound(MathAbs(entry - tp1_price) / pip);
   }
   if(tp2_price > 0)
   {
      if(side == "BUY") tp2_pips = (int)MathRound(MathAbs(tp2_price - entry) / pip);
      else             tp2_pips = (int)MathRound(MathAbs(entry - tp2_price) / pip);
   }
   if(tp3_price > 0)
   {
      if(side == "BUY") tp3_pips = (int)MathRound(MathAbs(tp3_price - entry) / pip);
      else             tp3_pips = (int)MathRound(MathAbs(entry - tp3_price) / pip);
   }

   if(tp1_pips <= 0) tp1_pips = DefaultTP1_Pips;
   if(tp2_pips <= 0) tp2_pips = DefaultTP2_Pips;
   if(tp3_pips <= 0) tp3_pips = DefaultTP3_Pips;

   return ExecuteAUTO(symbol, side, entry, sl_pips, tp1_pips, tp2_pips, tp3_pips, threshold_pips, out_msg);
}

bool ExecuteSHORTHAND(string symbol, string side,
                      int entry1, int entry2,
                      int sl_short,
                      int tp1_short, int tp2_short, int tp3_short,
                      int threshold_pips,
                      string &out_msg)
{
   // NOTE: Format 2 (SHORTHAND) is independent from Format 1.
   // It must open ONLY 2 positions (TP1/TP2) and must NOT force TP3.
   if(entry1 <= 0 || entry2 <= 0 || sl_short <= 0 || tp1_short <= 0 || tp2_short <= 0)
   {
      out_msg = "BAD_SHORTHAND_FIELDS";
      return(false);
   }

   // Convert shorthand levels to absolute prices using current Bid/Ask base100.
   double e1 = ShorthandToPrice(symbol, entry1);
   double e2 = ShorthandToPrice(symbol, entry2);
   double slp = ShorthandToPrice(symbol, sl_short);
   double tp1p = ShorthandToPrice(symbol, tp1_short);
   double tp2p = ShorthandToPrice(symbol, tp2_short);

   if(e1 <= 0 || e2 <= 0 || slp <= 0 || tp1p <= 0 || tp2p <= 0)
   {
      out_msg = "SHORTHAND_TO_PRICE_FAILED";
      return(false);
   }

   RefreshRates();
   double bid = MarketInfo(symbol, MODE_BID);
   double ask = MarketInfo(symbol, MODE_ASK);
   int tradeAllowed = (int)MarketInfo(symbol, MODE_TRADEALLOWED);
   if(bid <= 0 || ask <= 0 || tradeAllowed == 0)
   {
      out_msg = "Market closed / trade disabled. Will retry when market opens.";
      return false;
   }
   if(!IsTradeAllowed())
   {
      out_msg = ExplainTradeNotAllowed();
      return false;
   }

   double pip = PipSize(symbol);
   if(pip <= 0) { out_msg = "PIPSIZE_ZERO"; return false; }
   int digits = (int)MarketInfo(symbol, MODE_DIGITS);

   // Risk split across 2 positions
   double pipValue1Lot = PipValuePerLot(symbol);
   if(pipValue1Lot <= 0) { out_msg = "pipValue calc failed"; return false; }
   int sl_pips_sh = sl_short; // SHORTHAND SL is provided in pips (distance), not absolute price
   if(sl_pips_sh < 1) sl_pips_sh = 1;
   double riskMoneyTotal = AccountBalance() * (RiskPercent / 100.0);
   double lotTotal = riskMoneyTotal / (sl_pips_sh * pipValue1Lot);
   lotTotal = NormalizeLot(symbol, lotTotal);
   double lot_leg1 = NormalizeLot(symbol, lotTotal * 0.50);
   double lot_leg2 = NormalizeLot(symbol, MathMax(lotTotal - lot_leg1, 0.0));

   // Helper to place one leg (market/pending based on threshold)
   string msg1 = "", msg2 = "";
   bool ok1 = false, ok2 = false;

   // Leg1: entry e1 -> TP1
   {
      double refPrice = (side == "BUY") ? ask : bid;
      double distPips = MathAbs(e1 - refPrice) / pip;
      bool useMarket = (distPips <= threshold_pips);

      int orderType;
      double sendPrice;
      if(useMarket)
      {
         orderType = (side == "BUY") ? OP_BUY : OP_SELL;
         sendPrice = (side == "BUY") ? ask : bid;
      }
      else
      {
         orderType = PendingTypeFromEntry(side, e1, bid, ask);
         sendPrice = e1;
      }

      // stopLevel validation in pips from the actual order price
      int minStop = BrokerMinStopPips(symbol) + StopBufferPips;
      double slDist = MathAbs(sendPrice - slp) / pip;
      double tpDist = MathAbs(tp1p - sendPrice) / pip;
      if(minStop > 0 && (slDist < minStop || tpDist < minStop))
      {
         out_msg = "Stops too close for SHORTHAND leg1. Required >= " + IntegerToString(minStop) + " pips.";
         return false;
      }

      int sl_pips_leg1 = (int)MathRound(MathAbs(sendPrice - slp) / pip);
      if(sl_pips_leg1 < 1) sl_pips_leg1 = 1;
      double lots = lot_leg1;

      sendPrice = NormalizeDouble(sendPrice, digits);
      double slN = NormalizeDouble(slp, digits);
      double tpN = NormalizeDouble(tp1p, digits);
      ok1 = SendMicroBatch(symbol, orderType, sendPrice, slN, tpN, lots, "SB-SH1", msg1);
   }

   // Leg2: entry e2 -> TP2
   {
      double refPrice = (side == "BUY") ? ask : bid;
      double distPips = MathAbs(e2 - refPrice) / pip;
      bool useMarket = (distPips <= threshold_pips);

      int orderType;
      double sendPrice;
      if(useMarket)
      {
         orderType = (side == "BUY") ? OP_BUY : OP_SELL;
         sendPrice = (side == "BUY") ? ask : bid;
      }
      else
      {
         orderType = PendingTypeFromEntry(side, e2, bid, ask);
         sendPrice = e2;
      }

      int minStop = BrokerMinStopPips(symbol) + StopBufferPips;
      double slDist = MathAbs(sendPrice - slp) / pip;
      double tpDist = MathAbs(tp2p - sendPrice) / pip;
      if(minStop > 0 && (slDist < minStop || tpDist < minStop))
      {
         out_msg = "Stops too close for SHORTHAND leg2. Required >= " + IntegerToString(minStop) + " pips.";
         return false;
      }

      int sl_pips_leg2 = (int)MathRound(MathAbs(sendPrice - slp) / pip);
      if(sl_pips_leg2 < 1) sl_pips_leg2 = 1;
      double lots = lot_leg2;

      sendPrice = NormalizeDouble(sendPrice, digits);
      double slN = NormalizeDouble(slp, digits);
      double tpN = NormalizeDouble(tp2p, digits);
      ok2 = SendMicroBatch(symbol, orderType, sendPrice, slN, tpN, lots, "SB-SH2", msg2);
   }

   if(!ok1 || !ok2)
   {
      out_msg = "SHORTHAND_FAIL";
      if(!ok1) out_msg += " leg1:" + msg1;
      if(!ok2) out_msg += " leg2:" + msg2;
      return false;
   }

   out_msg = "SHORTHAND_OK risk=" + DoubleToString(RiskPercent,1) + "%";
   return true;
}


double PipValuePerLot(string symbol)
{
   double tickValue = MarketInfo(symbol, MODE_TICKVALUE);
   double point     = MarketInfo(symbol, MODE_POINT);
   double pip       = PipSize(symbol);
   if(point <= 0 || pip <= 0) return 0;
   return tickValue * (pip / point);
}

double NormalizeLot(string symbol, double lots)
{
   double minLot  = MarketInfo(symbol, MODE_MINLOT);
   double maxLot  = MarketInfo(symbol, MODE_MAXLOT);
   double stepLot = MarketInfo(symbol, MODE_LOTSTEP);
   if(stepLot <= 0) stepLot = 0.01;

   if(lots < minLot) lots = minLot;
   if(lots > maxLot) lots = maxLot;

   lots = MathFloor(lots / stepLot) * stepLot;
   lots = NormalizeDouble(lots, 2);

   if(lots < minLot) lots = minLot;
   return lots;
}

string GetValue(string src, string key)
{
   string parts[];
   int n = StringSplit(src, ';', parts);
   for(int i=0;i<n;i++)
   {
      string kv[];
      if(StringSplit(parts[i], '=', kv) == 2)
      {
         if(Trim(kv[0]) == key) return Trim(kv[1]);
      }
   }
   return "";
}

string ExplainTradeNotAllowed()
{
   return "Trade not allowed. Check AutoTrading ON + EA 'Allow live trading' + Options->Expert Advisors + symbol session.";
}

int BrokerMinStopPips(string symbol)
{
   double pointSize = MarketInfo(symbol, MODE_POINT);
   double pip   = PipSize(symbol);
   int stopPts  = (int)MarketInfo(symbol, MODE_STOPLEVEL);
   if(Point <= 0 || pip <= 0) return 0;
   double distPrice = stopPts * Point;
   return (int)MathCeil(distPrice / pip);
}

// --------- Centralized Logger (to file + experts) ----------
void SB_Logger(string text)
{
   string msg = "[" + TimeToStr(TimeLocal(), TIME_DATE|TIME_SECONDS) + "] " + text;
   Print(msg); // keep in experts tab
   
   int h = FileOpen(LOG_FILE, FILE_READ|FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(h == INVALID_HANDLE)
   {
      // try to create/fix if path missing
      h = FileOpen(LOG_FILE, FILE_WRITE|FILE_TXT|FILE_COMMON);
   }
   
   if(h != INVALID_HANDLE)
   {
      FileSeek(h, 0, SEEK_END);
      FileWrite(h, msg);
      FileClose(h);
   }
}

// --------- PATCH: WriteResult retry (err=5004 safe) ----------
void WriteResult(string id, string status, string msg)
{
   string fname = OUTBOX_DIR + "/res_" + id + ".txt";
   int h = INVALID_HANDLE;

   // retry in case of transient FS lock / timing
   for(int i=0;i<15;i++)
   {
      h = FileOpen(fname, FILE_WRITE | FILE_TXT | FILE_COMMON);
      if(h != INVALID_HANDLE) break;
      Sleep(80);
   }

   if(h == INVALID_HANDLE)
   {
      int err = GetLastError();
      SB_Logger("WriteResult ERROR: failed err=" + IntegerToString(err) + " file=" + fname + " (ensure Common/Files/softibridge/outbox exists)");
      return;
   }

   FileWrite(h, "id=" + id);
   FileWrite(h, "status=" + status);
   FileWrite(h, "msg=" + msg);
   FileClose(h);
   
   SB_Logger("Result saved: ID=" + id + " Status=" + status + " Msg=" + msg);
}
// -----------------------------------------------------------

int PendingTypeFromEntry(string side, double entry, double bid, double ask)
{
   if(side == "BUY")
      return (entry < ask ? OP_BUYLIMIT : OP_BUYSTOP);
   else
      return (entry > bid ? OP_SELLLIMIT : OP_SELLSTOP);
}

void CalcSLTP_FromPrice(string side, double basePrice, int sl_pips, int tp_pips, string symbol, double &sl, double &tp)
{
   double pip = PipSize(symbol);
   int digits = (int)MarketInfo(symbol, MODE_DIGITS);

   if(side == "BUY")
   {
      sl = basePrice - sl_pips * pip;
      tp = basePrice + tp_pips * pip;
   }
   else
   {
      sl = basePrice + sl_pips * pip;
      tp = basePrice - tp_pips * pip;
   }

   sl = NormalizeDouble(sl, digits);
   tp = NormalizeDouble(tp, digits);
}


void SB_LogExecution(int ticket, double requestedPrice)
{
   string sym = g_ctx_symbol;
   string side = g_ctx_side;
   double signal = g_ctx_signal_price;
   int spreadPts = g_ctx_spread_pts;
   int devPts = g_ctx_dev_pts;

   double execPrice = requestedPrice;
   int otype = -1;
   if(OrderSelect(ticket, SELECT_BY_TICKET))
   {
      otype = OrderType();
      // For market orders, OrderOpenPrice() is the filled price
      execPrice = OrderOpenPrice();
   }

   double point = MarketInfo(sym, MODE_POINT);
   int digits = (int)MarketInfo(sym, MODE_DIGITS);

   // Recompute deviation against signal using filled price (more accurate)
   int devPtsFilled = devPts;
   if(point > 0 && signal > 0)
      devPtsFilled = (int)MathRound((execPrice - signal) / point);

   string devSign = (devPtsFilled >= 0) ? "+" : "";
   string msg = "SB EXEC | sym=" + sym +
                " | side=" + side +
                " | signal=" + DoubleToString(signal, digits) +
                " | req=" + DoubleToString(requestedPrice, digits) +
                " | exec=" + DoubleToString(execPrice, digits) +
                " | spread_pts=" + IntegerToString(spreadPts) +
                " | dev_pts=" + devSign + IntegerToString(devPtsFilled) +
                " | ticket=" + IntegerToString(ticket) +
                " | " + g_ctx_comment;
   SB_Logger(msg);
}


bool SendMicroBatch(string symbol, int orderType, double priceOrEntry, double sl, double tp, double totalLots, string comment, string &out_msg)
{
   totalLots = NormalizeLot(symbol, totalLots);
   // LITE public behavior: 3 orders total (TP1/TP2/TP3), NOT many micro-orders.
   // We keep the helper name for backward compatibility, but we send a single ticket per call.
   int ticket = OrderSend(symbol, orderType, totalLots, priceOrEntry, SLIPPAGE, sl, tp, comment, MAGIC, 0, clrGold);
   if(ticket < 0)
   {
      int err = GetLastError();
      if(err == 4109) out_msg = ExplainTradeNotAllowed();
      else out_msg = "OrderSend failed err=" + IntegerToString(err) + " type=" + IntegerToString(orderType) + " lots=" + DoubleToString(totalLots,2);
      SB_Logger(out_msg);
      return false;
   }

   out_msg = "ticket=" + IntegerToString(ticket) + " lots=" + DoubleToString(totalLots, 2);
   return true;
}

bool ValidateOrAdjustStops(string symbol, int &sl_pips, int &tp1, int &tp2, int &tp3, string &why)
{
   int minStop = BrokerMinStopPips(symbol);
   int required = minStop + StopBufferPips;
   if(required <= 0) return true;

   bool tooClose = (sl_pips < required || tp1 < required || tp2 < required || tp3 < required);
   if(!tooClose) return true;

   if(!AutoAdjustStops)
   {
      why = "Stops too close. Required >= " + IntegerToString(required) + " pips (broker stopLevel=" + IntegerToString(minStop) + "). " +
            "Got SL=" + IntegerToString(sl_pips) + " TP1=" + IntegerToString(tp1) + " TP2=" + IntegerToString(tp2) + " TP3=" + IntegerToString(tp3);
      return false;
   }

   if(sl_pips < required) sl_pips = required;
   if(tp1 < required) tp1 = required;
   if(tp2 < required) tp2 = required;
   if(tp3 < required) tp3 = required;

   why = "Adjusted stops to broker minimum " + IntegerToString(required) + " pips.";
   return true;
}

bool ExecuteAUTO(string symbol, string side, double entry, int sl_pips, int tp1_pips, int tp2_pips, int tp3_pips, int threshold_pips, string &out_msg)
{
   if(!SymbolSelect(symbol, true))
   {
      out_msg = "SymbolSelect failed";
      return false;
   }

   // SL override (minimal)
   int sl_eff = sl_pips;
   if(UseFixedSL) sl_eff = FixedSL_Pips;
   if(UseSLMultiplier) sl_eff = (int)MathRound(sl_pips * SL_Multiplier);
   sl_eff += SL_ExtraPips;
   if(sl_eff < 1) sl_eff = 1;
   sl_pips = sl_eff;

   if(tp2_pips <= 0) tp2_pips = DefaultTP2_Pips;
   if(tp3_pips <= 0) tp3_pips = DefaultTP3_Pips;

   string why = "";
   if(!ValidateOrAdjustStops(symbol, sl_pips, tp1_pips, tp2_pips, tp3_pips, why))
   {
      out_msg = why;
      return false;
   }

   RefreshRates();

   double bid = MarketInfo(symbol, MODE_BID);
   double ask = MarketInfo(symbol, MODE_ASK);
   double pip = PipSize(symbol);

   int tradeAllowed = (int)MarketInfo(symbol, MODE_TRADEALLOWED);
   if(bid <= 0 || ask <= 0 || tradeAllowed == 0)
   {
      out_msg = "Market closed / trade disabled. Will retry when market opens.";
      return false;
   }

   if(!IsTradeAllowed())
   {
      out_msg = ExplainTradeNotAllowed();
      return false;
   }

   int digits = (int)MarketInfo(symbol, MODE_DIGITS);

   double pipValue1Lot = PipValuePerLot(symbol);
   if(pipValue1Lot <= 0)
   {
      out_msg = "pipValue calc failed";
      return false;
   }

   double riskMoney = AccountBalance() * (RiskPercent / 100.0);
   double lotTotal  = riskMoney / (sl_pips * pipValue1Lot);
   lotTotal = NormalizeLot(symbol, lotTotal);

   // Split total risk across 3 legs (ensure sum ~= lotTotal after rounding)
   double lot1 = NormalizeLot(symbol, lotTotal * 0.50);
   double lot2 = NormalizeLot(symbol, lotTotal * 0.30);
   double lot3 = NormalizeLot(symbol, MathMax(lotTotal - lot1 - lot2, 0.0));
   // --- Spread filter + compensation ---
   bool forcePendingDueToSpread = false;
   double pointSizeNow = MarketInfo(symbol, MODE_POINT);
   int spreadPtsNow = (int)MarketInfo(symbol, MODE_SPREAD);
   if(g_MaxSpreadPoints > 0 && spreadPtsNow > g_MaxSpreadPoints)
   {
      double cfgPips = (pointSizeNow > 0.0 ? (g_MaxSpreadPoints * pointSizeNow) / pip : 0.0);
      double nowPips = (pointSizeNow > 0.0 ? (spreadPtsNow * pointSizeNow) / pip : 0.0);
      
      // Instead of failing, we force the order as PENDING
      forcePendingDueToSpread = true;
      if(why != "") why += " | ";
      why += "[SPREAD_HIGH: forcing pending]";
      SB_Logger("Spread high (" + DoubleToString(nowPips,1) + " pips > " + DoubleToString(cfgPips,1) + "), forcing order as PENDING.");
   }

// Use MID price for distance check (signal price is often mid), then widen threshold by current spread (optional)
double mid = (bid + ask) * 0.5;
double distPips = MathAbs(entry - mid) / pip;

double spreadPips = (pointSizeNow > 0.0) ? ((spreadPtsNow * pointSizeNow) / pip) : 0.0;
double effThreshold = threshold_pips;
if(SpreadCompensation)
   effThreshold = MathMax(effThreshold, spreadPips);

bool useMarket = (distPips <= effThreshold && !forcePendingDueToSpread);
// MARKET
   if(useMarket)
   {
      int orderType = (side == "BUY") ? OP_BUY : OP_SELL;
      double price  = (side == "BUY") ? ask : bid;
      price = NormalizeDouble(price, digits);

      double sl,tp;
      string msgBatch;

      CalcSLTP_FromPrice(side, price, sl_pips, tp1_pips, symbol, sl, tp);
      g_ctx_comment = "SB1.0.1-MKT-TP1";
      if(!SendMicroBatch(symbol, orderType, price, sl, tp, lot1, "SB1.0.1-MKT-TP1", msgBatch))
      { out_msg = "AUTO(MARKET) TP1 " + msgBatch; return false; }

      CalcSLTP_FromPrice(side, price, sl_pips, tp2_pips, symbol, sl, tp);
      g_ctx_comment = "SB1.0.1-MKT-TP2";
      if(!SendMicroBatch(symbol, orderType, price, sl, tp, lot2, "SB1.0.1-MKT-TP2", msgBatch))
      { out_msg = "AUTO(MARKET) TP2 " + msgBatch; return false; }

      CalcSLTP_FromPrice(side, price, sl_pips, tp3_pips, symbol, sl, tp);
      g_ctx_comment = "SB1.0.1-MKT-TP3";
      if(!SendMicroBatch(symbol, orderType, price, sl, tp, lot3, "SB1.0.1-MKT-TP3", msgBatch))
      { out_msg = "AUTO(MARKET) TP3 " + msgBatch; return false; }

      out_msg = "AUTO(MARKET) dist=" + DoubleToString(distPips,1) + " lots=" + DoubleToString(lotTotal,2) +
                " risk=" + DoubleToString(RiskPercent,1) + "% " + why;
      return true;
   }

   // PENDING
   // --- set execution context for transparent logging (PENDING)
   {
      double pointSize = MarketInfo(symbol, MODE_POINT);
      g_ctx_symbol = symbol;
      g_ctx_side   = side;
      g_ctx_signal_price = entry;
      g_ctx_req_price    = entry;
      g_ctx_spread_pts   = (Point>0)? (int)MathRound((ask-bid)/Point) : 0;
      g_ctx_dev_pts      = 0;
   }

   int pendingType = PendingTypeFromEntry(side, entry, bid, ask);

   double pointSize = MarketInfo(symbol, MODE_POINT);
   int stopPts = (int)MarketInfo(symbol, MODE_STOPLEVEL);
   double minDist = stopPts * Point;

   if(pendingType == OP_BUYLIMIT)
   {
      double maxEntry = ask - minDist;
      if(entry > maxEntry) entry = maxEntry;
   }
   if(pendingType == OP_BUYSTOP)
   {
      double minEntry = ask + minDist;
      if(entry < minEntry) entry = minEntry;
   }
   if(pendingType == OP_SELLLIMIT)
   {
      double minEntry = bid + minDist;
      if(entry < minEntry) entry = minEntry;
   }
   if(pendingType == OP_SELLSTOP)
   {
      double maxEntry = bid - minDist;
      if(entry > maxEntry) entry = maxEntry;
   }

   entry = NormalizeDouble(entry, digits);

   double sl,tp;
   string msgBatch;

   CalcSLTP_FromPrice(side, entry, sl_pips, tp1_pips, symbol, sl, tp);
   g_ctx_comment = "SB1.0.1-PND-TP1";
   if(!SendMicroBatch(symbol, pendingType, entry, sl, tp, lot1, "SB1.0.1-PND-TP1", msgBatch))
   { out_msg = "AUTO(PENDING) TP1 " + msgBatch; return false; }

   CalcSLTP_FromPrice(side, entry, sl_pips, tp2_pips, symbol, sl, tp);
   g_ctx_comment = "SB1.0.1-PND-TP2";
   if(!SendMicroBatch(symbol, pendingType, entry, sl, tp, lot2, "SB1.0.1-PND-TP2", msgBatch))
   { out_msg = "AUTO(PENDING) TP2 " + msgBatch; return false; }

   CalcSLTP_FromPrice(side, entry, sl_pips, tp3_pips, symbol, sl, tp);
   g_ctx_comment = "SB1.0.1-PND-TP3";
   if(!SendMicroBatch(symbol, pendingType, entry, sl, tp, lot3, "SB1.0.1-PND-TP3", msgBatch))
   { out_msg = "AUTO(PENDING) TP3 " + msgBatch; return false; }

   out_msg = "AUTO(PENDING) dist=" + DoubleToString(distPips,1) +
             " type=" + IntegerToString(pendingType) +
             " entry=" + DoubleToString(entry, digits) +
             " lots=" + DoubleToString(lotTotal,2) +
             " risk=" + DoubleToString(RiskPercent,1) + "% " + why;
   return true;
}

void ApplyTPPrice(double tpPrice)
{
   string sym = Symbol();
   double stopLevel = MarketInfo(sym, MODE_STOPLEVEL)*MarketInfo(sym, MODE_POINT);
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol()!=sym) continue;
      if(OrderMagicNumber()!=MAGIC) continue;
      if(StringFind(OrderComment(), "SoftiBridge") < 0) continue;
      int ot = OrderType();
      if(ot!=OP_BUY && ot!=OP_SELL) continue;
      if(ot==OP_BUY)
      {
         if(tpPrice <= Ask + stopLevel) continue;
      }
      else
      {
         if(tpPrice >= Bid - stopLevel) continue;
      }
      double sl = OrderStopLoss();
      SB_OrderModify(OrderTicket(), OrderOpenPrice(), sl, tpPrice);
   }
}

bool ApplySLTPToTicket(int ticket, double slPrice, double tpPrice, bool doSL, bool doTP)
{
   if(ticket <= 0) return false;
   if(!OrderSelect(ticket, SELECT_BY_TICKET)) return false;
   int ot = OrderType();
   if(ot!=OP_BUY && ot!=OP_SELL && ot!=OP_BUYLIMIT && ot!=OP_BUYSTOP && ot!=OP_SELLLIMIT && ot!=OP_SELLSTOP) return false;
   double op = OrderOpenPrice();
   double sl = doSL ? slPrice : OrderStopLoss();
   double tp = doTP ? tpPrice : OrderTakeProfit();
   if(ot==OP_BUY || ot==OP_SELL)
      return SB_OrderModify(OrderTicket(), op, sl, tp);
   ResetLastError();
   bool ok = OrderModify(OrderTicket(), op, sl, tp, OrderExpiration(), clrNONE);
   if(!ok) { int e = GetLastError(); Print("[SB] OrderModify(pending) failed ticket=", ticket, " err=", e); ResetLastError(); }
   return ok;
}

bool CloseOrCancelTicket(int ticket)
{
   if(ticket <= 0) return false;
   if(!OrderSelect(ticket, SELECT_BY_TICKET)) return false;
   if(OrderMagicNumber()!=MAGIC && StringFind(OrderComment(), "SoftiBridge") < 0) return false;
   int ot = OrderType();
   if(ot==OP_BUY || ot==OP_SELL)
   {
      double price = (ot==OP_BUY)?Bid:Ask;
      return SB_OrderClose(OrderTicket(), OrderLots(), price);
   }
   return OrderDelete(OrderTicket());
}

bool ExecuteRemoteControl(string id, string line, string symbol, string &out_msg)
{
   string action = UpperASCII(GetValue(line, "action"));
   string filter = UpperASCII(GetValue(line, "filter"));
   int ticket = (int)StrToInteger(GetValue(line, "ticket"));
   double slp = StrToDouble(GetValue(line, "sl_price"));
   double tpp = StrToDouble(GetValue(line, "tp_price"));
   int move_sl_pips = (int)StrToInteger(GetValue(line, "move_sl_pips"));

   if(action == "CLOSE_TICKET")
   {
      if(ticket<=0){ out_msg="CTRL_BAD_TICKET"; return false; }
      if(CloseOrCancelTicket(ticket)){ out_msg="CTRL_CLOSE_TICKET_OK"; return true; }
      out_msg="CTRL_CLOSE_TICKET_FAIL"; return false;
   }
   if(action == "CANCEL_TICKET")
   {
      if(ticket<=0){ out_msg="CTRL_BAD_TICKET"; return false; }
      if(CloseOrCancelTicket(ticket)){ out_msg="CTRL_CANCEL_TICKET_OK"; return true; }
      out_msg="CTRL_CANCEL_TICKET_FAIL"; return false;
   }
   if(action == "CLOSE_ALL" || action == "CLOSE_BUY" || action == "CLOSE_SELL")
   {
      if(ticket > 0) { if(CloseOrCancelTicket(ticket)){ out_msg="CTRL_CLOSE_TICKET_OK"; return true; } out_msg="CTRL_CLOSE_TICKET_FAIL"; return false; }
      if(action == "CLOSE_BUY") CloseFiltered(OP_BUY);
      else if(action == "CLOSE_SELL") CloseFiltered(OP_SELL);
      else CloseFiltered(0);
      out_msg = "CTRL_" + action + "_OK";
      return true;
   }
   if(action == "CANCEL_ALL" || action == "CANCEL_BUY" || action == "CANCEL_SELL")
   {
      // Reuse CloseFiltered: for pending it deletes, for market it also closes. Ticket-specific preferred for single pending.
      if(ticket > 0) { if(CloseOrCancelTicket(ticket)){ out_msg="CTRL_CANCEL_TICKET_OK"; return true; } out_msg="CTRL_CANCEL_TICKET_FAIL"; return false; }
      if(action == "CANCEL_BUY") CloseFiltered(OP_BUY);
      else if(action == "CANCEL_SELL") CloseFiltered(OP_SELL);
      else CloseFiltered(0);
      out_msg = "CTRL_" + action + "_OK";
      return true;
   }
   if(action == "SET_SLTP" || action == "SET_SL" || action == "SET_TP")
   {
      bool doSL = (action == "SET_SLTP" || action == "SET_SL");
      bool doTP = (action == "SET_SLTP" || action == "SET_TP");
      if(ticket > 0)
      {
         if(ApplySLTPToTicket(ticket, slp, tpp, doSL, doTP)){ out_msg="CTRL_"+action+"_OK"; return true; }
         out_msg="CTRL_"+action+"_FAIL"; return false;
      }
      if(doSL) ApplySLPrice(slp);
      if(doTP) ApplyTPPrice(tpp);
      out_msg = "CTRL_" + action + "_OK";
      return true;
   }
   if(action == "MOVE_SL")
   {
      if(move_sl_pips == 0) move_sl_pips = MoveSL_Pips_UI;
      MoveSLByPips(move_sl_pips);
      out_msg = "CTRL_MOVE_SL_OK";
      return true;
   }
   if(action == "MOVE_BE")
   {
      MoveToBE();
      out_msg = "CTRL_MOVE_BE_OK";
      return true;
   }
   out_msg = "CTRL_UNKNOWN_ACTION";
   return false;
}

void WriteBridgeStateSnapshot()
{
   string posFile = "softibridge/state/positions_mt4.txt";
   string penFile = "softibridge/state/pending_mt4.txt";
   string sumFile = "softibridge/state/bridge_state_summary.txt";
   int hp = FileOpen(posFile, FILE_WRITE|FILE_TXT|FILE_COMMON);
   int ho = FileOpen(penFile, FILE_WRITE|FILE_TXT|FILE_COMMON);
   int hs = FileOpen(sumFile, FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(hp==INVALID_HANDLE || ho==INVALID_HANDLE)
   {
      if(hp!=INVALID_HANDLE) FileClose(hp);
      if(ho!=INVALID_HANDLE) FileClose(ho);
      if(hs!=INVALID_HANDLE) FileClose(hs);
      return;
   }
   int posCnt = 0;
   int penCnt = 0;
   double profit = 0.0;
   string sym = Symbol();
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber()!=MAGIC && StringFind(OrderComment(), "SoftiBridge") < 0) continue;
      if(OrderSymbol()!=sym) continue;
      int ot = OrderType();
      string side = (ot==OP_SELL || ot==OP_SELLLIMIT || ot==OP_SELLSTOP) ? "SELL" : "BUY";
      if(ot==OP_BUY || ot==OP_SELL)
      {
         posCnt++;
         profit += OrderProfit() + OrderSwap() + OrderCommission();
         string line = "platform=MT4;ticket=" + IntegerToString(OrderTicket()) +
                       ";symbol=" + OrderSymbol() +
                       ";side=" + side +
                       ";type=" + IntegerToString(ot) +
                       ";lots=" + DoubleToString(OrderLots(),2) +
                       ";open=" + DoubleToString(OrderOpenPrice(),Digits) +
                       ";sl=" + DoubleToString(OrderStopLoss(),Digits) +
                       ";tp=" + DoubleToString(OrderTakeProfit(),Digits) +
                       ";pnl=" + DoubleToString(OrderProfit() + OrderSwap() + OrderCommission(),2) +
                       ";comment=" + OrderComment();
         FileWrite(hp, line);
      }
      else
      {
         penCnt++;
         string pline = "platform=MT4;ticket=" + IntegerToString(OrderTicket()) +
                        ";symbol=" + OrderSymbol() +
                        ";side=" + side +
                        ";type=" + IntegerToString(ot) +
                        ";lots=" + DoubleToString(OrderLots(),2) +
                        ";price=" + DoubleToString(OrderOpenPrice(),Digits) +
                        ";sl=" + DoubleToString(OrderStopLoss(),Digits) +
                        ";tp=" + DoubleToString(OrderTakeProfit(),Digits) +
                        ";comment=" + OrderComment();
         FileWrite(ho, pline);
      }
   }
   if(hs != INVALID_HANDLE)
   {
      FileWrite(hs, "ts=" + IntegerToString((int)TimeCurrent()));
      FileWrite(hs, "mt4_positions=" + IntegerToString(posCnt));
      FileWrite(hs, "mt4_pending=" + IntegerToString(penCnt));
      FileWrite(hs, "mt4_floating_pnl=" + DoubleToString(profit,2));
      FileClose(hs);
   }
   FileClose(hp);
   FileClose(ho);
}

// --- Heartbeat control
int last_heartbeat = 0;

void ProcessQueue()
{
   datetime now = TimeCurrent();
   
   // Heatbeat ogni 60 secondi nel log file per conferma vita (meno rumoroso)
   if((int)now - last_heartbeat >= 60)
   {
      SB_Logger("HB: EA active, checking queue...");
      last_heartbeat = (int)now;
   }

   // throttle retries when market closed/trading disabled
   if(wait_id != "" && now < wait_next_retry)
      return;

   // Open queue: try COMMON strictly (canonical for this setup)
   // Using FILE_READ | FILE_TXT is safe and does NOT truncate if we never use FILE_WRITE.
   int h = FileOpen(QUEUE_FILE, FILE_READ|FILE_TXT|FILE_COMMON);
   
   if(h == INVALID_HANDLE)
   {
      // Prova fallback locale solo se il common fallisce
      h = FileOpen(QUEUE_FILE_LOCAL, FILE_READ|FILE_TXT);
   }

   if(h == INVALID_HANDLE)
   {
      int err = GetLastError();
      if((int)now - last_queue_warn_ts >= 30) // log ogni 30 sec se fallisce apertura
      {
         SB_Logger("ERROR: Cannot open queue file. Error=" + IntegerToString(err) + " Path=" + QUEUE_FILE);
         last_queue_warn_ts = (int)now;
      }
      return;
   }

   // Read all lines into memory
   string q_content = "";
   while(!FileIsEnding(h))
   {
      string chunk = FileReadString(h);
      if(chunk != "") q_content += chunk + "\n";
   }
   FileClose(h);

   if(q_content == "" || q_content == "0")
      return;

   SB_Logger("Queue event: Found commands to process.");

   string lines[];
   int numLines = StringSplit(q_content, '\n', lines);

   int lineIdx = 0;
   while(lineIdx < numLines)
   {
      string line = Trim(lines[lineIdx]);
      lineIdx++;
      if(line == "") continue;

      string id = GetValue(line, "id");
      if(id == "") continue;

      // Skip already-processed IDs
      if(last_id != "" && StringCompare(id, last_id) <= 0)
         continue;

      SB_Logger("Processing command: ID=" + id);

      string mode = UpperASCII(GetValue(line, "mode"));
      if(mode == "") mode = "PIPS";

      string sym_req = GetValue(line, "symbol");
      string symbol  = ResolveSymbol(sym_req);
      if(symbol == "") symbol = Symbol();
      // Ensure symbol is selected so quotes are available (prevents false 'market closed')
      if(!SymbolSelect(symbol, true))
      {
         symbol = Symbol();
         SymbolSelect(symbol, true);
      }

      string side = UpperASCII(GetValue(line, "side"));
      if(mode == "CTRL")
      {
         string ctrlMsg = "";
         bool ctrlOk = ExecuteRemoteControl(id, line, symbol, ctrlMsg);
         WriteResult(id, ctrlOk ? "OK" : "FAIL", ctrlMsg);
         last_id = id; SaveLastId();
         break;
      }
      if(side != "BUY" && side != "SELL")
      {
         WriteResult(id, "FAIL", "BAD_SIDE");
         last_id = id; SaveLastId();
         break;
      }

      int threshold_pips = (int)StrToInteger(GetValue(line, "threshold_pips"));
      // Backward-safe: if signal doesn't specify threshold_pips, use EA default input
      if(threshold_pips <= 0) threshold_pips = DefaultThresholdPips;

      // Spread compensation: widen threshold to account for current broker spread (and optional extra margin)
      if(SpreadCompensation)
      {
         double spread_pips_now = SB_PointsToPips(symbol, MarketInfo(symbol, MODE_SPREAD));
         double eff = spread_pips_now + SpreadExtraPips;
         if(eff > 0.0)
            threshold_pips += (int)MathCeil(eff);
      }


      // Market open / trading allowed checks (write WAIT only once)
      RefreshRates();
      double ask = MarketInfo(symbol, MODE_ASK);
      double bid = MarketInfo(symbol, MODE_BID);
      if(ask <= 0 || bid <= 0)
      {
         wait_id = id;
         wait_next_retry = TimeCurrent() + RetrySecondsWhenClosed;
         if(!FileIsExist(OUTBOX_DIR + "/res_" + id + ".txt", true))
            WriteResult(id, "WAIT", "MARKET_CLOSED");
         break;
      }
      if(!IsTradeAllowed())
      {
         wait_id = id;
         wait_next_retry = TimeCurrent() + RetrySecondsWhenClosed;
         if(!FileIsExist(OUTBOX_DIR + "/res_" + id + ".txt", true))
            WriteResult(id, "WAIT", "AUTOTRADING_OFF");
         break;
      }

      bool ok = false;
      string msg = "";

      if(mode == "PIPS")
      {
         double entry  = StrToDouble(GetValue(line, "entry"));
         int sl_pips   = (int)StrToInteger(GetValue(line, "sl_pips"));
         int tp1_pips  = (int)StrToInteger(GetValue(line, "tp1_pips"));
         int tp2_pips  = (int)StrToInteger(GetValue(line, "tp2_pips"));
         int tp3_pips  = (int)StrToInteger(GetValue(line, "tp3_pips"));
         if(tp2_pips <= 0) tp2_pips = DefaultTP2_Pips;
         if(tp3_pips <= 0) tp3_pips = DefaultTP3_Pips;

         if(entry <= 0 || sl_pips <= 0 || tp1_pips <= 0)
         {
            WriteResult(id, "FAIL", "BAD_PIPS_FIELDS");
            last_id = id; SaveLastId();
            break;
         }

         ok = ExecuteAUTO(symbol, side, entry, sl_pips, tp1_pips, tp2_pips, tp3_pips, threshold_pips, msg);
      }
      else if(mode == "PRICE")
      {
         double entry_lo = StrToDouble(GetValue(line, "entry_lo"));
         double entry_hi = StrToDouble(GetValue(line, "entry_hi"));
         double sl_price = StrToDouble(GetValue(line, "sl_price"));
         double tp1_price = StrToDouble(GetValue(line, "tp1_price"));
         double tp2_price = StrToDouble(GetValue(line, "tp2_price"));
         double tp3_price = StrToDouble(GetValue(line, "tp3_price"));

         ok = ExecutePRICE(symbol, side, entry_lo, entry_hi, sl_price, tp1_price, tp2_price, tp3_price, threshold_pips, msg);
      }
      else if(mode == "SHORTHAND")
      {
         int e1 = (int)StrToInteger(GetValue(line, "entry1"));
         int e2 = (int)StrToInteger(GetValue(line, "entry2"));
         int sl = (int)StrToInteger(GetValue(line, "sl"));
         int tp1 = (int)StrToInteger(GetValue(line, "tp1"));
         int tp2 = (int)StrToInteger(GetValue(line, "tp2"));
         int tp3 = (int)StrToInteger(GetValue(line, "tp3"));
         // NOTE: Format 2 is independent: do NOT force TP3.
         ok = ExecuteSHORTHAND(symbol, side, e1, e2, sl, tp1, tp2, tp3, threshold_pips, msg);
      }
      else
      {
         WriteResult(id, "FAIL", "UNKNOWN_MODE");
         last_id = id; SaveLastId();
         break;
      }

      if(ok)
      {
         WriteResult(id, "OK", msg);
         last_id = id; SaveLastId();
         wait_id = "";
         wait_next_retry = 0;
      }
      else
      {
         // If Execute... returned a "WAIT_*" message, do not advance last_id (retry later)
         if(StringFind(msg, "WAIT_") == 0)
         {
            wait_id = id;
            wait_next_retry = TimeCurrent() + RetrySecondsWhenClosed;
            if(!FileIsExist(OUTBOX_DIR + "/res_" + id + ".txt", true))
               WriteResult(id, "WAIT", msg);
         }
         else
         {
            WriteResult(id, "FAIL", msg);
            last_id = id; SaveLastId();
         }
      }

      break; // process only one new command per timer tick
   }
}


int OnInit()
{

// Normalize MaxSpread: keep INPUTS immutable; compute runtime g_MaxSpreadPoints (points)
g_MaxSpreadPips   = MaxSpreadPips;
g_MaxSpreadPoints = MaxSpreadPoints;
if(g_MaxSpreadPoints <= 0 && g_MaxSpreadPips > 0.0)
   g_MaxSpreadPoints = SB_PipsToPoints(Symbol(), g_MaxSpreadPips);

   LoadReported();
   UI_CreatePanel();
   EventSetTimer(1);

   LoadLastId();
   SB_Logger("SoftiBridge EA V_3.0.3 (LITE) avviato. Queue(COMMON)=" + QUEUE_FILE +
         " RiskPercent=" + DoubleToString(RiskPercent,1) + "%" + " last_id=" + last_id);
   EventSetTimer(1);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   UI_DestroyPanel();
   EventKillTimer();

   EventKillTimer();
}

void OnTimer()
{
   ScanHistoryForEvents();

   ProcessQueue();
   WriteBridgeStateSnapshot();
}

void OnTick()
{
}


// ================================
// v2: UI Panel + SL/TP Events (ADMIN only via bot)
// ================================
string EVENTS_FILE = "softibridge/outbox/events.txt";
string REPORTED_FILE = "softibridge/state/reported_tickets.txt";

// UI object names
const string UI_PREFIX = "SB_";
const string OBJ_PANEL_BG = "SB_PANEL_BG";
const string OBJ_BTN_CLOSE_ALL = "SB_BTN_CLOSE_ALL";
const string OBJ_BTN_CLOSE_BUY = "SB_BTN_CLOSE_BUY";
const string OBJ_BTN_CLOSE_SELL= "SB_BTN_CLOSE_SELL";
const string OBJ_BTN_MOVE_SL   = "SB_BTN_MOVE_SL";
const string OBJ_BTN_BE        = "SB_BTN_BE";
const string OBJ_BTN_SL_APPLY  = "SB_BTN_SL_APPLY";
const string OBJ_BTN_TP_PLUS   = "SB_BTN_TP_PLUS";
const string OBJ_BTN_TP_MINUS  = "SB_BTN_TP_MINUS";
const string OBJ_BTN_SL_PLUS   = "SB_BTN_SL_PLUS";
const string OBJ_BTN_SL_MINUS  = "SB_BTN_SL_MINUS";
const string OBJ_EDIT_TARGET   = "SB_EDIT_TARGET";
const string OBJ_EDIT_SLPRICE  = "SB_EDIT_SL";
const string OBJ_LINE_TARGET   = "SB_LINE_TARGET";
const string OBJ_LINE_SL       = "SB_LINE_SL";

// runtime UI state
bool ui_ready = false;
double ui_target_price = 0.0;
double ui_sl_price = 0.0;

// reported tickets cache (simple)
string reported_cache = ""; // newline-separated ticket ids

bool IsBridgeOrder()
{
   if(OrderMagicNumber() != MAGIC) return false;
   string c = OrderComment();
   if(StringFind(c, "SoftiBridge") < 0) return false;
   return true;
}

void LoadReported()
{
   reported_cache = "";
   int h = FileOpen(REPORTED_FILE, FILE_READ|FILE_TXT|FILE_COMMON);
   if(h == INVALID_HANDLE) return;
   while(!FileIsEnding(h))
   {
      string ln = Trim(FileReadString(h));
      if(ln != "") reported_cache += ln + "/n";
   }
   FileClose(h);
}

bool IsReported(int ticket)
{
   string t = IntegerToString(ticket);
   if(StringFind(reported_cache, t + "\n") >= 0) return true;
   return false;
}

void MarkReported(int ticket)
{
   if(IsReported(ticket)) return;
   string t = IntegerToString(ticket);
   string out = reported_cache + t + "\n";
   int h = FileOpen(REPORTED_FILE, FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(h == INVALID_HANDLE) return;
   FileWriteString(h, out);
   FileClose(h);
   reported_cache = out;
}

void AppendEvent(string id, string ev, string symbol, string side)
{
   int h = FileOpen(EVENTS_FILE, FILE_READ|FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(h == INVALID_HANDLE)
   {
      h = FileOpen(EVENTS_FILE, FILE_WRITE|FILE_TXT|FILE_COMMON);
      if(h == INVALID_HANDLE) return;
   }
   FileSeek(h, 0, SEEK_END);
   string line = "ts=" + IntegerToString((int)TimeCurrent()) + ";id=" + id + ";event=" + ev + ";symbol=" + symbol + ";side=" + side + ";";
   FileWriteString(h, line + "\n");
   FileClose(h);
}

// Append with extra kv pairs (must end with ';' if non-empty)
void AppendEventEx(string id, string ev, string symbol, string side, string extra)
{
   int h = FileOpen(EVENTS_FILE, FILE_READ|FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(h == INVALID_HANDLE)
   {
      h = FileOpen(EVENTS_FILE, FILE_WRITE|FILE_TXT|FILE_COMMON);
      if(h == INVALID_HANDLE) return;
   }
   FileSeek(h, 0, SEEK_END);
   string line = "ts=" + IntegerToString((int)TimeCurrent()) + ";id=" + id + ";event=" + ev + ";symbol=" + symbol + ";side=" + side + ";" + extra;
   FileWriteString(h, line + "\n");
   FileClose(h);
}

// Extract signal id and TP index from comment: SoftiBridge|<id>|TP1
bool ParseComment(string c, string &id, string &tp)
{
   id = ""; tp = "";
   int p = StringFind(c, "SoftiBridge|");
   if(p < 0) return false;
   string rest = StringSubstr(c, p + StringLen("SoftiBridge|"));
   int p2 = StringFind(rest, "|");
   if(p2 < 0) return false;
   id = StringSubstr(rest, 0, p2);
   tp = StringSubstr(rest, p2+1);
   return (id != "" && tp != "");
}

void ScanHistoryForEvents()
{
   static datetime last_scan = 0;
   datetime now = TimeCurrent();
   if(last_scan == 0) last_scan = now - 3600;

   int total = OrdersHistoryTotal();
   for(int i=total-1; i>=0 && i>total-2000; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if(OrderCloseTime() <= last_scan) break;
      if(!IsBridgeOrder()) continue;

      int ticket = OrderTicket();
      if(IsReported(ticket)) continue;

      string id,tp;
      string c = OrderComment();
      if(!ParseComment(c, id, tp))
      {
         // fallback: use last_id
         id = last_id;
         tp = "TP";
      }

      double cp = OrderClosePrice();
      double tpv = OrderTakeProfit();
      double slv = OrderStopLoss();
      string ev = "";
      // tolerance: 3 points
      double tol = MarketInfo(OrderSymbol(), MODE_POINT) * 3.0;
      if(tpv > 0 && MathAbs(cp - tpv) <= tol)
         ev = tp; // TP1/TP2/TP3
      else if(slv > 0 && MathAbs(cp - slv) <= tol)
         ev = "SL";
      else
      {
         // if profit < 0 treat as SL
         if(OrderProfit() < 0) ev = "SL";
         else ev = tp;
      }

      AppendEvent(id, ev, OrderSymbol(), (OrderType()==OP_BUY ? "BUY":"SELL"));
      MarkReported(ticket);
   }
   last_scan = now;
}

// ===== UI helpers
void UI_SetLine(string name, double price)
{
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   }
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
}

void UI_SetEdit(string name, double price)
{
   string txt = DoubleToString(price, (int)MarketInfo(Symbol(), MODE_DIGITS));
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
}

double UI_GetEditPrice(string name)
{
   string t = ObjectGetString(0, name, OBJPROP_TEXT);
   t = Trim(t);
   if(t=="") return 0.0;
   double v = StrToDouble(t);
   return v;
}

void UI_CreatePanel()
{
   if(!UIPanelEnabled) return;

   // init defaults from current price
   double mid = (Bid+Ask)/2.0;
   if(ui_target_price <= 0) ui_target_price = mid;
   if(ui_sl_price     <= 0) ui_sl_price     = mid;

   // compact panel on the LEFT side (doesn't cover price axis)
   int corner = CORNER_LEFT_UPPER;
   int x = 10;
   int y = 30;
   int w = 170;
   int h = 18;
   int gap = 4;

   // Background panel
   int total_h = (h+gap)*9; // enough height for all rows
   ObjectCreate(0, OBJ_PANEL_BG, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, OBJ_PANEL_BG, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_PANEL_BG, OBJPROP_XDISTANCE, x-6);
   ObjectSetInteger(0, OBJ_PANEL_BG, OBJPROP_YDISTANCE, y-6);
   ObjectSetInteger(0, OBJ_PANEL_BG, OBJPROP_XSIZE, w+12);
   ObjectSetInteger(0, OBJ_PANEL_BG, OBJPROP_YSIZE, total_h);
   ObjectSetInteger(0, OBJ_PANEL_BG, OBJPROP_BACK, true);
   ObjectSetInteger(0, OBJ_PANEL_BG, OBJPROP_HIDDEN, true);

   // helper macro-like lambda (MQL4 doesn't have lambdas)

   // --- Row 1: CLOSE ALL
   ObjectCreate(0, OBJ_BTN_CLOSE_ALL, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_ALL, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_ALL, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_ALL, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_ALL, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_CLOSE_ALL, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_ALL, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_ALL, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_ALL, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_ALL, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_CLOSE_ALL, OBJPROP_TEXT, "CLOSE ALL");

   // --- Row 2: CLOSE BUY / CLOSE SELL
   int y2 = y + (h+gap);
   int half = (w/2)-2;

   ObjectCreate(0, OBJ_BTN_CLOSE_BUY, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_BUY, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_BUY, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_BUY, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_BUY, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_CLOSE_BUY, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_BUY, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_BUY, OBJPROP_YDISTANCE, y2);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_BUY, OBJPROP_XSIZE, half);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_BUY, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_CLOSE_BUY, OBJPROP_TEXT, "CLOSE BUY");

   ObjectCreate(0, OBJ_BTN_CLOSE_SELL, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_SELL, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_SELL, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_SELL, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_SELL, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_CLOSE_SELL, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_SELL, OBJPROP_XDISTANCE, x + half + 4);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_SELL, OBJPROP_YDISTANCE, y2);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_SELL, OBJPROP_XSIZE, half);
   ObjectSetInteger(0, OBJ_BTN_CLOSE_SELL, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_CLOSE_SELL, OBJPROP_TEXT, "CLOSE SELL");

   // --- Row 3: MOVE SL / BE
   int y3 = y2 + (h+gap);

   ObjectCreate(0, OBJ_BTN_MOVE_SL, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_MOVE_SL, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_MOVE_SL, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_MOVE_SL, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_MOVE_SL, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_MOVE_SL, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_MOVE_SL, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, OBJ_BTN_MOVE_SL, OBJPROP_YDISTANCE, y3);
   ObjectSetInteger(0, OBJ_BTN_MOVE_SL, OBJPROP_XSIZE, half);
   ObjectSetInteger(0, OBJ_BTN_MOVE_SL, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_MOVE_SL, OBJPROP_TEXT, "MOVE SL");

   ObjectCreate(0, OBJ_BTN_BE, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_BE, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_BE, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_BE, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_BE, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_BE, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_BE, OBJPROP_XDISTANCE, x + half + 4);
   ObjectSetInteger(0, OBJ_BTN_BE, OBJPROP_YDISTANCE, y3);
   ObjectSetInteger(0, OBJ_BTN_BE, OBJPROP_XSIZE, half);
   ObjectSetInteger(0, OBJ_BTN_BE, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_BE, OBJPROP_TEXT, "BE (100pt)");

   // --- Target Price edit
   int y4 = y3 + (h+gap) + 6;

   ObjectCreate(0, OBJ_EDIT_TARGET, OBJ_EDIT, 0, 0, 0);
   ObjectSetInteger(0, OBJ_EDIT_TARGET, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_EDIT_TARGET, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_EDIT_TARGET, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_EDIT_TARGET, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_EDIT_TARGET, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_EDIT_TARGET, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, OBJ_EDIT_TARGET, OBJPROP_YDISTANCE, y4);
   ObjectSetInteger(0, OBJ_EDIT_TARGET, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, OBJ_EDIT_TARGET, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_EDIT_TARGET, OBJPROP_TEXT, DoubleToString(ui_target_price, (int)MarketInfo(Symbol(), MODE_DIGITS)));

   int y5 = y4 + (h+gap);
   ObjectCreate(0, OBJ_BTN_TP_MINUS, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_TP_MINUS, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_TP_MINUS, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_TP_MINUS, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_TP_MINUS, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_TP_MINUS, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_TP_MINUS, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, OBJ_BTN_TP_MINUS, OBJPROP_YDISTANCE, y5);
   ObjectSetInteger(0, OBJ_BTN_TP_MINUS, OBJPROP_XSIZE, half);
   ObjectSetInteger(0, OBJ_BTN_TP_MINUS, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_TP_MINUS, OBJPROP_TEXT, "- TARGET");

   ObjectCreate(0, OBJ_BTN_TP_PLUS, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_TP_PLUS, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_TP_PLUS, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_TP_PLUS, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_TP_PLUS, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_TP_PLUS, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_TP_PLUS, OBJPROP_XDISTANCE, x + half + 4);
   ObjectSetInteger(0, OBJ_BTN_TP_PLUS, OBJPROP_YDISTANCE, y5);
   ObjectSetInteger(0, OBJ_BTN_TP_PLUS, OBJPROP_XSIZE, half);
   ObjectSetInteger(0, OBJ_BTN_TP_PLUS, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_TP_PLUS, OBJPROP_TEXT, "+ TARGET");

   // --- SL Price edit + Apply
   int y6 = y5 + (h+gap) + 6;

   ObjectCreate(0, OBJ_EDIT_SLPRICE, OBJ_EDIT, 0, 0, 0);
   ObjectSetInteger(0, OBJ_EDIT_SLPRICE, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_EDIT_SLPRICE, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_EDIT_SLPRICE, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_EDIT_SLPRICE, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_EDIT_SLPRICE, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_EDIT_SLPRICE, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, OBJ_EDIT_SLPRICE, OBJPROP_YDISTANCE, y6);
   ObjectSetInteger(0, OBJ_EDIT_SLPRICE, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, OBJ_EDIT_SLPRICE, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_EDIT_SLPRICE, OBJPROP_TEXT, DoubleToString(ui_sl_price, (int)MarketInfo(Symbol(), MODE_DIGITS)));

   int y7 = y6 + (h+gap);
   ObjectCreate(0, OBJ_BTN_SL_MINUS, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_SL_MINUS, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_SL_MINUS, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_SL_MINUS, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_SL_MINUS, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_SL_MINUS, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_SL_MINUS, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, OBJ_BTN_SL_MINUS, OBJPROP_YDISTANCE, y7);
   ObjectSetInteger(0, OBJ_BTN_SL_MINUS, OBJPROP_XSIZE, half);
   ObjectSetInteger(0, OBJ_BTN_SL_MINUS, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_SL_MINUS, OBJPROP_TEXT, "- SL");

   ObjectCreate(0, OBJ_BTN_SL_PLUS, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_SL_PLUS, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_SL_PLUS, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_SL_PLUS, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_SL_PLUS, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_SL_PLUS, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_SL_PLUS, OBJPROP_XDISTANCE, x + half + 4);
   ObjectSetInteger(0, OBJ_BTN_SL_PLUS, OBJPROP_YDISTANCE, y7);
   ObjectSetInteger(0, OBJ_BTN_SL_PLUS, OBJPROP_XSIZE, half);
   ObjectSetInteger(0, OBJ_BTN_SL_PLUS, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_SL_PLUS, OBJPROP_TEXT, "+ SL");

   int y8 = y7 + (h+gap);
   ObjectCreate(0, OBJ_BTN_SL_APPLY, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, OBJ_BTN_SL_APPLY, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, OBJ_BTN_SL_APPLY, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, OBJ_BTN_SL_APPLY, OBJPROP_BACK, false);
   ObjectSetInteger(0, OBJ_BTN_SL_APPLY, OBJPROP_ZORDER, 0);

   ObjectSetInteger(0, OBJ_BTN_SL_APPLY, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, OBJ_BTN_SL_APPLY, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, OBJ_BTN_SL_APPLY, OBJPROP_YDISTANCE, y8);
   ObjectSetInteger(0, OBJ_BTN_SL_APPLY, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, OBJ_BTN_SL_APPLY, OBJPROP_YSIZE, h);
   ObjectSetString(0, OBJ_BTN_SL_APPLY, OBJPROP_TEXT, "APPLY SL");

   // lines on chart
   UI_SetLine(OBJ_LINE_TARGET, ui_target_price);
   UI_SetLine(OBJ_LINE_SL, ui_sl_price);
   ui_ready = true;
}



void UI_DestroyPanel()
{
   ObjectDelete(0, OBJ_PANEL_BG);

   string objs[]; ArrayResize(objs,14);
   objs[0]=OBJ_BTN_CLOSE_ALL; objs[1]=OBJ_BTN_CLOSE_BUY; objs[2]=OBJ_BTN_CLOSE_SELL; objs[3]=OBJ_BTN_MOVE_SL; objs[4]=OBJ_BTN_BE;
   objs[5]=OBJ_BTN_SL_APPLY; objs[6]=OBJ_BTN_TP_PLUS; objs[7]=OBJ_BTN_TP_MINUS; objs[8]=OBJ_BTN_SL_PLUS; objs[9]=OBJ_BTN_SL_MINUS;
   objs[10]=OBJ_EDIT_TARGET; objs[11]=OBJ_EDIT_SLPRICE; objs[12]=OBJ_LINE_TARGET; objs[13]=OBJ_LINE_SL;
   for(int i=0;i<ArraySize(objs);i++) ObjectDelete(0, objs[i]);
   ui_ready = false;
}


// --- Safe trade ops (reduce MetaEditor warnings)
bool SB_OrderClose(int ticket, double lots, double price)
{
   ResetLastError();
   bool ok = OrderClose(ticket, lots, price, SLIPPAGE, clrNONE);
   if(!ok)
   {
      int e = GetLastError();
      Print("[SB] OrderClose failed. ticket=", ticket, " err=", e);
      ResetLastError();
   }
   return ok;
}

bool SB_OrderModify(int ticket, double openPrice, double sl, double tp)
{
   ResetLastError();
   bool ok = OrderModify(ticket, openPrice, sl, tp, 0, clrNONE);
   if(!ok)
   {
      int e = GetLastError();
      Print("[SB] OrderModify failed. ticket=", ticket, " err=", e, " sl=", DoubleToString(sl,Digits), " tp=", DoubleToString(tp,Digits));
      ResetLastError();
   }
   return ok;
}

void CloseFiltered(int type)
{
   string sym = Symbol();
   int closedCnt = 0;
   int deletedCnt = 0;
   int foundCnt = 0;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol()!=sym) continue;
      // Accept trades if either Magic matches OR comment contains SoftiBridge
      if(OrderMagicNumber()!=MAGIC && StringFind(OrderComment(), "SoftiBridge") < 0) continue;
      foundCnt++;

      int ot = OrderType();

      // Decide if this order is part of requested filter
      bool match = false;
      if(type==0) match = true;
      else if(type==OP_BUY)
      {
         match = (ot==OP_BUY || ot==OP_BUYLIMIT || ot==OP_BUYSTOP);
      }
      else if(type==OP_SELL)
      {
         match = (ot==OP_SELL || ot==OP_SELLLIMIT || ot==OP_SELLSTOP);
      }
      if(!match) continue;

      // Market positions
      if(ot==OP_BUY || ot==OP_SELL)
      {
         double price = (ot==OP_BUY)?Bid:Ask;
         if(SB_OrderClose(OrderTicket(), OrderLots(), price)) closedCnt++;
      }
      else
      {
         // Pending orders
         if(OrderDelete(OrderTicket())) deletedCnt++;
         else
         {
            int e = GetLastError();
            Print("[SB] OrderDelete failed. ticket=", OrderTicket(), " err=", e);
            ResetLastError();
         }
      }
   }

   Print("[SB][UI] CloseFiltered type=", type, " found=", foundCnt, " closed=", closedCnt, " deleted=", deletedCnt);

   // Notify admin bot only when user explicitly pressed Close All
   if(type==0 && (closedCnt>0 || deletedCnt>0))
   {
      string sid = (last_id!="" ? last_id : "UNKNOWN");
      string extra = "closed=" + IntegerToString(closedCnt) + ";deleted=" + IntegerToString(deletedCnt) + ";by=USER;";
      AppendEventEx(sid, "SIGNAL_DELETED", sym, "", extra);
   }
}

void ApplySLPrice(double slPrice)
{
   string sym = Symbol();
   double stopLevel = MarketInfo(sym, MODE_STOPLEVEL)*MarketInfo(sym, MODE_POINT);
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol()!=sym) continue;
      if(OrderMagicNumber()!=MAGIC) continue;
      if(StringFind(OrderComment(), "SoftiBridge") < 0) continue;

      int ot = OrderType();
      if(ot!=OP_BUY && ot!=OP_SELL) continue;

      // validate
      if(ot==OP_BUY)
      {
         if(slPrice >= Bid - stopLevel) continue;
      }
      else
      {
         if(slPrice <= Ask + stopLevel) continue;
      }
      double tp = OrderTakeProfit();
      SB_OrderModify(OrderTicket(), OrderOpenPrice(), slPrice, tp);
   }
}

void MoveSLByPips(int pips)
{
   string sym = Symbol();
   double pip = PipSize(sym);
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol()!=sym) continue;
      if(OrderMagicNumber()!=MAGIC) continue;
      if(StringFind(OrderComment(), "SoftiBridge") < 0) continue;

      int ot = OrderType();
      if(ot!=OP_BUY && ot!=OP_SELL) continue;
      double sl = OrderStopLoss();
      if(sl<=0) continue;
      double newSL = sl + (ot==OP_BUY ? (pips*pip) : -(pips*pip));
      double tp = OrderTakeProfit();
      SB_OrderModify(OrderTicket(), OrderOpenPrice(), newSL, tp);
   }
   ui_sl_price = UI_GetEditPrice(OBJ_EDIT_SLPRICE);
   UI_SetLine(OBJ_LINE_SL, ui_sl_price);
}

void MoveToBE()
{
   string sym = Symbol();
   double pt = MarketInfo(sym, MODE_POINT);
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol()!=sym) continue;
      if(OrderMagicNumber()!=MAGIC) continue;
      if(StringFind(OrderComment(), "SoftiBridge") < 0) continue;

      int ot = OrderType();
      if(ot!=OP_BUY && ot!=OP_SELL) continue;
      double op = OrderOpenPrice();
      double profitPts = (ot==OP_BUY) ? ((Bid - op)/pt) : ((op - Ask)/pt);
      if(profitPts < BE_MinPoints) continue;
      double be = op + (ot==OP_BUY ? (BE_OffsetPoints*pt) : -(BE_OffsetPoints*pt));
      double tp = OrderTakeProfit();
      SB_OrderModify(OrderTicket(), op, be, tp);
   }
}

void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(!UIPanelEnabled) return;
   if(!ui_ready) return;

   if(id != CHARTEVENT_OBJECT_CLICK) return;

   string n = sparam;
   Print("[UI] click: ", n);

   if(n == OBJ_BTN_CLOSE_ALL) { CloseFiltered(0); return; }
   if(n == OBJ_BTN_CLOSE_BUY) { CloseFiltered(OP_BUY); return; }
   if(n == OBJ_BTN_CLOSE_SELL){ CloseFiltered(OP_SELL); return; }

   if(n == OBJ_BTN_TP_PLUS)
   {
      double v = UI_GetEditPrice(OBJ_EDIT_TARGET);
      v += StepPrice;
      ui_target_price = v;
      UI_SetEdit(OBJ_EDIT_TARGET, v);
      UI_SetLine(OBJ_LINE_TARGET, v);
      return;
   }
   if(n == OBJ_BTN_TP_MINUS)
   {
      double v2 = UI_GetEditPrice(OBJ_EDIT_TARGET);
      v2 -= StepPrice;
      ui_target_price = v2;
      UI_SetEdit(OBJ_EDIT_TARGET, v2);
      UI_SetLine(OBJ_LINE_TARGET, v2);
      return;
   }
   if(n == OBJ_BTN_SL_PLUS)
   {
      double v3 = UI_GetEditPrice(OBJ_EDIT_SLPRICE);
      v3 += StepPrice;
      ui_sl_price = v3;
      UI_SetEdit(OBJ_EDIT_SLPRICE, v3);
      UI_SetLine(OBJ_LINE_SL, v3);
      return;
   }
   if(n == OBJ_BTN_SL_MINUS)
   {
      double v4 = UI_GetEditPrice(OBJ_EDIT_SLPRICE);
      v4 -= StepPrice;
      ui_sl_price = v4;
      UI_SetEdit(OBJ_EDIT_SLPRICE, v4);
      UI_SetLine(OBJ_LINE_SL, v4);
      return;
   }
   if(n == OBJ_BTN_SL_APPLY)
   {
      double sp = UI_GetEditPrice(OBJ_EDIT_SLPRICE);
      ui_sl_price = sp;
      UI_SetLine(OBJ_LINE_SL, sp);
      ApplySLPrice(sp);
      return;
   }
   if(n == OBJ_BTN_MOVE_SL)
   {
      MoveSLByPips(MoveSL_Pips_UI);
      return;
   }
   if(n == OBJ_BTN_BE)
   {
      MoveToBE();
      return;
   }
}


// --- Legacy wrappers (compat) ---
void ApplySLPriceToOpenTrades(double slPrice){ ApplySLPrice(slPrice); }
void MoveSL_ByPips(int pips){ MoveSLByPips(pips); }
