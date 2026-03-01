// --- SoftiBridge LITE MT5 ---
#property strict
#property description "SoftiBridge LITE v2 - MT5 (pending orders + spread comp/maxspread + common queue)"
#property version   "3.21"

#include <Trade/Trade.mqh>
#include <Trade/PositionInfo.mqh>
#include <Trade/OrderInfo.mqh>

static string sb_last_peek="";

string SB_ReadQueueSmartCommon(const string relPath)
{
   int h = FileOpen(relPath, FILE_READ|FILE_BIN|FILE_COMMON);
   if(h == INVALID_HANDLE)
   {
      Print(StringFormat("❌ [IO] FileOpen COMMON BIN failed: %s err=%d", relPath, GetLastError()));
      ResetLastError();
      return "";
   }

   int sz = (int)FileSize(h);
   if(sz <= 0) { FileClose(h); return ""; }

   uchar bytes[];
   ArrayResize(bytes, sz);
   int read = (int)FileReadArray(h, bytes, 0, sz);
   FileClose(h);
   if(read <= 0) return "";

   // Detect UTF-16LE (ASCII stored as low byte + 0x00 high byte)
   int zerosOdd=0, samples=0;
   int lim = MathMin(read, 200);
   for(int i=1; i<lim; i+=2){ samples++; if(bytes[i]==0x00) zerosOdd++; }
   bool looksUtf16LE = (samples>10 && zerosOdd > (samples*8)/10);

   // Detect BOM
   bool bomUtf16LE = (read>=2 && bytes[0]==0xFF && bytes[1]==0xFE);
   bool bomUtf8    = (read>=3 && bytes[0]==0xEF && bytes[1]==0xBB && bytes[2]==0xBF);
   int off = 0;
   if(bomUtf16LE) off = 2;
   else if(bomUtf8) off = 3;

   string out = "";

   if(bomUtf16LE || looksUtf16LE)
   {
		// UTF-16LE: decode pairs (low byte first) to avoid garbled text
		for(int i=off; i+1<read; i+=2)
		{
			ushort code = (ushort)bytes[i] | (ushort)((ushort)bytes[i+1] << 8);
			if(code==0) continue;
				// Avoid compiler warning (possible loss of data due to type conversion)
				// and keep full codepoint by formatting as int.
				out += StringFormat("%c", (int)code);
		}
   }
   else
   {
		for(int i=off; i<read; i++)
		{
			ushort code = (ushort)bytes[i];
			if(code==0) continue;
			out += StringFormat("%c", (int)code);
		}
   }

   StringReplace(out, "\r", "");
   return out;
}

string SB_LastNonEmptyLine(string s)
{
   StringReplace(s, "\r", "");
   // Trim trailing newlines/spaces
   while(StringLen(s)>0)
   {
      ushort ch = StringGetCharacter(s, StringLen(s)-1);
      if(ch=='\n' || ch==' ' || ch=='\t') s = StringSubstr(s, 0, StringLen(s)-1);
      else break;
   }
   if(StringLen(s)==0) return "";

   int lastNL = StringFind(s, "\n", 0);
   // We'll scan manually for last newline
   int pos=-1;
   for(int i=0;i<StringLen(s);i++)
   {
      if(StringGetCharacter(s,i)=='\n') pos=i;
   }
   string line = (pos>=0) ? StringSubstr(s, pos+1) : s;
   line = SB_TrimLine(line);
   return line;
}

// (header/includes moved to top)

// --- SB DEBUG HELPERS ---
string SB_TrimLine(string s)
{
   // remove BOM if present
   if(StringLen(s)>=1 && StringGetCharacter(s,0)==0xFEFF) s = StringSubstr(s,1);
   // trim spaces
   StringTrimLeft(s);
   StringTrimRight(s);
   // remove trailing CR
   int n = StringLen(s);
   if(n>0 && StringGetCharacter(s,n-1)==13) s = StringSubstr(s,0,n-1);
   return s;
}
// --- END SB DEBUG HELPERS ---
// --- SB QUEUE PATHS (MT5 inbox patch) ---
string SB_QUEUE_INBOX_MT5 = "softibridge/inbox/cmd_queue_mt5.txt";
string SB_QUEUE_INBOX  = "softibridge/inbox/cmd_queue.txt";
string SB_QUEUE_COMMON = "softibridge/cmd_queue.txt";
string SB_QUEUE_ROOT   = "cmd_queue.txt";
// --- END SB QUEUE PATHS ---

static string _sb_last_raw = "";
static int _sb_last_size = -1;
// --- SB MT5 COMMON-ONLY QUEUE (v3.0.9) ---
void SB_LogEvery(const string msg, const int seconds)
{
   static datetime last=0;
   datetime now=TimeCurrent();
   if(now-last >= seconds){ Print(msg); last=now; }

}

// Pip/Point factor: for most symbols (2/3/5 digits) 1 pip = 10 points; otherwise 1 pip = 1 point.
int SB_PipPoints(const string sym)
{
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   if(d==2 || d==3 || d==5) return 10;
   return 1;
}
int SB_PipsToPoints(const string sym, const double pips)
{
   return (int)MathRound(pips * (double)SB_PipPoints(sym));
}
double SB_PointsToPips(const string sym, const int points)
{
   return ((double)points) / (double)SB_PipPoints(sym);
}


int SB_OpenQueueCommonRead()
{
   int h = FileOpen(SB_QUEUE_INBOX_MT5, FILE_READ|FILE_TXT|FILE_COMMON);
   if(h!=INVALID_HANDLE) return h;
   h = FileOpen(SB_QUEUE_INBOX, FILE_READ|FILE_TXT|FILE_COMMON);
   if(h!=INVALID_HANDLE) return h;
   h = FileOpen(SB_QUEUE_COMMON, FILE_READ|FILE_TXT|FILE_COMMON);
   if(h!=INVALID_HANDLE) return h;
   h = FileOpen(SB_QUEUE_ROOT, FILE_READ|FILE_TXT|FILE_COMMON);
   return h;
}

int SB_OpenQueueLocalRead()
{
   int h = FileOpen(SB_QUEUE_INBOX_MT5, FILE_READ|FILE_TXT);
   if(h!=INVALID_HANDLE) return h;
   h = FileOpen(SB_QUEUE_INBOX, FILE_READ|FILE_TXT);
   if(h!=INVALID_HANDLE) return h;
   h = FileOpen(SB_QUEUE_COMMON, FILE_READ|FILE_TXT);
   if(h!=INVALID_HANDLE) return h;
   h = FileOpen(SB_QUEUE_ROOT, FILE_READ|FILE_TXT);
   return h;
}


// --- END SB MT5 COMMON-ONLY ---
CTrade trade;

// --- Helpers ---
string StrTrim(string s){
   StringTrimLeft(s);
   StringTrimRight(s);
   return s;
}


// ================================
// Inputs (mirrored from MQ4)
// ================================
input double RiskPercent = 0.5;
input int    DefaultThresholdPips = 5;
input int    DefaultTP1_Pips = 50;
input int    DefaultTP2_Pips = 70;
input int    DefaultTP3_Pips = 100;
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
input bool   UIPanelEnabled = true;
input double StepPrice      = 0.10;   // +/- step for Target/SL price
input int    MoveSL_Pips_UI = 10;     // used by MOVE SL button
input int    BE_MinPoints   = 100;    // BE only if >= 100 points in profit
input int    BE_OffsetPoints= 15;     // small buffer to avoid instant stop by spread

// ================================
// Newer entry control (as agreed)
// ================================
input int    EntryTolerancePoints = 30;   // +/- 30 points

// --- Spread handling (MT4 parity) ---
input double MaxSpreadPips = 0.0;        // If >0, max allowed spread in PIPS (converted to points)
input int    MaxSpreadPoints = 0;        // If >0, overrides MaxSpreadPips (DIRECT points)
input bool   SpreadCompensation = true;  // If true, widen entry tolerance by current spread (+ SpreadExtraPips)
input double SpreadExtraPips = 0.0;      // Extra margin in PIPS added on top of current spread when SpreadCompensation is ON

input int    SpreadMaxPoints      = 35;   // max spread
input int    EntryMaxWaitSeconds  = 75;   // wait window
input int    EntryCheckMs         = 100;  // 100ms checks (fast)

// ================================
// Paths (Common\Files\softibridge)
// ================================
string SB_ROOT  = "softibridge";
// MT5 uses its own inbox queue file so MT4+MT5 can run side-by-side on different accounts.
// Bot writes BOTH: cmd_queue.txt (MT4) and cmd_queue_mt5.txt (MT5).
string SB_QUEUE = "softibridge/inbox/cmd_queue_mt5.txt";
string SB_LOG   = "logs\\ea_mt5.log";


// ================================
// UI Panel (MT5) - chart buttons
// ================================

// UI object names
const string UI_PREFIX = "SB_";
const string OBJ_PANEL_BG     = "SB_PANEL_BG";
const string OBJ_BTN_CLOSE_ALL= "SB_BTN_CLOSE_ALL";
const string OBJ_BTN_CLOSE_BUY= "SB_BTN_CLOSE_BUY";
const string OBJ_BTN_CLOSE_SELL="SB_BTN_CLOSE_SELL";

bool ui_ready=false;

// create a simple panel + 3 buttons (Close All / Close BUY / Close SELL)

// helper to create button (MT5)
void UI_CreateButton(string name, string text, int bx, int by){
   long cid=ChartID();
   if(ObjectFind(cid, name)<0){
      ObjectCreate(cid, name, OBJ_BUTTON, 0, 0, 0);
   }
   ObjectSetInteger(cid, name, OBJPROP_XDISTANCE, bx);
   ObjectSetInteger(cid, name, OBJPROP_YDISTANCE, by);
   ObjectSetInteger(cid, name, OBJPROP_XSIZE, 170);
   ObjectSetInteger(cid, name, OBJPROP_YSIZE, 20);
   ObjectSetInteger(cid, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetString (cid, name, OBJPROP_TEXT, text);
   ObjectSetInteger(cid, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(cid, name, OBJPROP_SELECTABLE, false);
}

void UI_CreatePanel(){
   if(!UIPanelEnabled) return;
   long cid=ChartID();
   int x=10, y=20, w=190, h=90;

   // background
   if(ObjectFind(cid, OBJ_PANEL_BG)<0){
      ObjectCreate(cid, OBJ_PANEL_BG, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   }
   ObjectSetInteger(cid, OBJ_PANEL_BG, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(cid, OBJ_PANEL_BG, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(cid, OBJ_PANEL_BG, OBJPROP_XSIZE, w);
   ObjectSetInteger(cid, OBJ_PANEL_BG, OBJPROP_YSIZE, h);
   ObjectSetInteger(cid, OBJ_PANEL_BG, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(cid, OBJ_PANEL_BG, OBJPROP_BACK, false);
   ObjectSetInteger(cid, OBJ_PANEL_BG, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(cid, OBJ_PANEL_BG, OBJPROP_HIDDEN, true);

   // helper to create button
   UI_CreateButton(OBJ_BTN_CLOSE_ALL, "CLOSE ALL", x+10, y+10);
      UI_CreateButton(OBJ_BTN_CLOSE_BUY, "CLOSE BUY", x+10, y+35);
      UI_CreateButton(OBJ_BTN_CLOSE_SELL,"CLOSE SELL",x+10, y+60);

   ui_ready=true;
   ChartRedraw(cid);
}

void UI_DestroyPanel(){
   long cid=ChartID();
   string objs[4]={OBJ_PANEL_BG,OBJ_BTN_CLOSE_ALL,OBJ_BTN_CLOSE_BUY,OBJ_BTN_CLOSE_SELL};
   for(int i=0;i<4;i++){
      if(ObjectFind(cid, objs[i])>=0) ObjectDelete(cid, objs[i]);
   }
   ui_ready=false;
}

// Close positions created by this EA (Magic + comment contains "SoftiBridge")
void CloseFiltered(int filterType){ // 0 all, 1 buy, 2 sell
   string sym=_Symbol;
   int total=PositionsTotal();
   int closed=0;
   for(int i=total-1;i>=0;i--){
      ulong ticket=PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;

      string psym=PositionGetString(POSITION_SYMBOL);
      if(psym!=sym) continue;

      long magic= (long)PositionGetInteger(POSITION_MAGIC);
      if(magic!=MAGIC) continue;

      string cmt=PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, "SoftiBridge")<0) continue;

      long type=PositionGetInteger(POSITION_TYPE);
      if(filterType==1 && type!=POSITION_TYPE_BUY) continue;
      if(filterType==2 && type!=POSITION_TYPE_SELL) continue;

      if(trade.PositionClose(ticket)){
         closed++;
      }
   }
   LogLine(StringFormat("[UI] CloseFiltered(%d) closed=%d", filterType, closed));
}

void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(!UIPanelEnabled || !ui_ready) return;
   if(id!=CHARTEVENT_OBJECT_CLICK) return;

   if(sparam==OBJ_BTN_CLOSE_ALL){ CloseFiltered(0); return; }
   if(sparam==OBJ_BTN_CLOSE_BUY){ CloseFiltered(1); return; }
   if(sparam==OBJ_BTN_CLOSE_SELL){ CloseFiltered(2); return; }
}


// simple context for transparent logs
string g_ctx_symbol="";
string g_ctx_side="";
double g_ctx_signal_price=0.0;
double g_ctx_req_price=0.0;
int    g_ctx_spread_pts=0;
int    g_ctx_dev_pts=0;
string g_ctx_comment="";

struct SBCommand {
   string id;
   string mode;      // PIPS / PRICE / SHORTHAND
   string action;    // CTRL actions
   string symbol;
   string side;      // BUY / SELL
   double entry;
   int    sl_pips;
   int    tp1_pips;
   int    tp2_pips;
   int    tp3_pips;
   string exec;      // AUTO
   int    threshold_pips;
   string comment;
   string filter;
   long   ticket;
   double sl_price;
   double tp_price;
   int    move_sl_pips;
   long   ts;
};

datetime g_last_queue_mtime=0;
long     g_last_queue_size=0;

// entry waiting state
bool     g_waiting=false;
datetime g_wait_deadline=0;
SBCommand g_wait_cmd;
string g_wait_rawline="";

// ----------------------------
// Helpers
// ----------------------------
string CommonPath() {
   // In MT5, FILE_COMMON points to common files.
   return SB_ROOT + "\\";
}

bool FileExistsCommon(string rel){
   int h = FileOpen(CommonPath()+rel, FILE_READ|FILE_COMMON|FILE_TXT);
   if(h!=INVALID_HANDLE){ FileClose(h); return true; }
   return false;
}

void EnsureDirs(){
   // MT5 can't create dirs directly in common; rely on existing or fail silently.
}

void LogLine(string s){
   Print(s);
   int h = FileOpen(CommonPath()+SB_LOG, FILE_WRITE|FILE_READ|FILE_COMMON|FILE_TXT|FILE_ANSI);
   if(h!=INVALID_HANDLE){
      FileSeek(h,0,SEEK_END);
      FileWrite(h, TimeToString(TimeCurrent(),TIME_DATE|TIME_SECONDS)+" | "+s);
      FileClose(h);
   }
}

int SpreadPoints(string sym){
   double ask=0,bid=0;
   if(!SymbolInfoDouble(sym,SYMBOL_ASK,ask) || !SymbolInfoDouble(sym,SYMBOL_BID,bid)) return 999999;
   double pt = SymbolInfoDouble(sym,SYMBOL_POINT);
   if(pt<=0) return 999999;
   return (int)MathRound((ask-bid)/pt);
}


double SB_PipSize(const string sym)
{
   // Softi convention: 1 pip = 10 points (works for 2/3/5-digit symbols; e.g. XAUUSD 2 decimals => 0.01 point => 0.10 pip)
   return SymbolInfoDouble(sym, SYMBOL_POINT) * 10.0;
}

double PipToPrice(const string sym, const int pips)
{
   return (double)pips * SB_PipSize(sym);
}

double PointsToPips(const string sym, const int points)
{
   return (double)points / 10.0; // 10 points = 1 pip
}

int PipsToPoints(const double pips)
{
   return (int)MathRound(pips * 10.0);
}


double NormalizeVolume(string sym,double vol){
   double vmin=SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN);
   double vmax=SymbolInfoDouble(sym,SYMBOL_VOLUME_MAX);
   double vstep=SymbolInfoDouble(sym,SYMBOL_VOLUME_STEP);
   if(vol<vmin) vol=vmin;
   if(vol>vmax) vol=vmax;
   // round down to step
   vol = MathFloor(vol/vstep)*vstep;
   if(vol<vmin) vol=vmin;
   return vol;
}

double CalcLotsByRisk(string sym,int sl_pips){
   if(sl_pips<=0) sl_pips=FixedSL_Pips;
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double risk_money = bal * (RiskPercent/100.0);

   double tick_value = SymbolInfoDouble(sym,SYMBOL_TRADE_TICK_VALUE);
   double tick_size  = SymbolInfoDouble(sym,SYMBOL_TRADE_TICK_SIZE);
   if(tick_value<=0 || tick_size<=0){
      return NormalizeVolume(sym, SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN));
   }
   double sl_price = PipToPrice(sym, sl_pips);
   // number of ticks in sl distance:
   double ticks = sl_price / tick_size;
   if(ticks<=0) ticks=1;
   double money_per_lot = ticks * tick_value;
   if(money_per_lot<=0) money_per_lot=1;

   double lots = risk_money / money_per_lot;
   return NormalizeVolume(sym, lots);
}

bool ParseKVLine(string line, SBCommand &cmd){
   // format: key=val;key=val;...
   cmd.id=""; cmd.mode=""; cmd.symbol=""; cmd.side=""; cmd.entry=0;
   cmd.sl_pips=0; cmd.tp1_pips=0; cmd.tp2_pips=0; cmd.tp3_pips=0;
   cmd.exec="AUTO"; cmd.threshold_pips=DefaultThresholdPips; cmd.comment="SoftiBridge";
   cmd.action=""; cmd.filter=""; cmd.ticket=0; cmd.sl_price=0; cmd.tp_price=0; cmd.move_sl_pips=0;
   cmd.ts=0;

   string parts[];
   int n = StringSplit(line,';',parts);
   if(n<2) return false;

   for(int i=0;i<n;i++){
      string kv=parts[i];
      int p=StringFind(kv,"=");
      if(p<0) continue;
      string k=StrTrim(StringSubstr(kv,0,p));
      string v=StrTrim(StringSubstr(kv,p+1));
      if(k=="id") cmd.id=v;
      else if(k=="ts") cmd.ts=(long)StringToInteger(v);
      else if(k=="mode") cmd.mode=v;
      else if(k=="symbol") cmd.symbol=v;
      else if(k=="side") cmd.side=v;
      else if(k=="entry") cmd.entry=StringToDouble(v);
      else if(k=="sl_pips") cmd.sl_pips=(int)StringToInteger(v);
      else if(k=="tp1_pips") cmd.tp1_pips=(int)StringToInteger(v);
      else if(k=="tp2_pips") cmd.tp2_pips=(int)StringToInteger(v);
      else if(k=="tp3_pips") cmd.tp3_pips=(int)StringToInteger(v);
      else if(k=="exec") cmd.exec=v;
      else if(k=="threshold_pips") cmd.threshold_pips=(int)StringToInteger(v);
      else if(k=="comment") cmd.comment=v;
      else if(k=="action") cmd.action=v;
      else if(k=="filter") cmd.filter=v;
      else if(k=="ticket") cmd.ticket=(long)StringToInteger(v);
      else if(k=="sl_price") cmd.sl_price=StringToDouble(v);
      else if(k=="tp_price") cmd.tp_price=StringToDouble(v);
      else if(k=="move_sl_pips") cmd.move_sl_pips=(int)StringToInteger(v);
   }
   if(cmd.symbol=="") cmd.symbol=_Symbol;
   if(cmd.tp1_pips<=0) cmd.tp1_pips=DefaultTP1_Pips;
   if(cmd.tp2_pips<=0) cmd.tp2_pips=DefaultTP2_Pips;
   if(cmd.tp3_pips<=0) cmd.tp3_pips=DefaultTP3_Pips;
   if(cmd.sl_pips<=0) cmd.sl_pips=FixedSL_Pips;
   if(cmd.mode=="") cmd.mode="PIPS";
   if(cmd.mode=="CTRL") return true;
   return (cmd.side=="BUY" || cmd.side=="SELL");
}



bool ReadNewestQueueLine(string &outLine){
   outLine="";
   string all = SB_ReadQueueSmartCommon("softibridge/inbox/cmd_queue_mt5.txt");
   if(all=="") return false;
   string last = SB_LastNonEmptyLine(all);
   if(last=="" || last=="0") return false;
   outLine = last;
   return true;
}



// NOTE: MT5 lacks FileReadLine in strict? We'll implement safer read using FileReadString in a loop with '\n' handling would be complex.
// For production, queue should store one command per token-friendly line without spaces. Current cmd format is token-friendly (no spaces).
// So FileReadString works.

double SideMarketPrice(string sym,string side){
   double ask=0,bid=0;
   SymbolInfoDouble(sym,SYMBOL_ASK,ask);
   SymbolInfoDouble(sym,SYMBOL_BID,bid);
   if(side=="BUY") return ask;
   return bid;
}

bool EntryConditionsOk(const SBCommand &cmd, int &spreadPts, int &devPts, double &reqPrice){
   // MT4 behavior is suffix-safe: validation/execution is always done on the CHART symbol.
   // Many MT5 brokers add suffixes (e.g. XAUUSD.p) so signals may carry XAUUSD
   // while the tradable symbol on the chart is XAUUSD.p. To match MT4, we use _Symbol.
   string sym = _Symbol;
   SymbolSelect(sym,true);

   spreadPts = SpreadPoints(sym);
   reqPrice  = SideMarketPrice(sym, cmd.side);
   double pt = SymbolInfoDouble(sym,SYMBOL_POINT);
   if(pt<=0.0){
      devPts = 0;
   } else {
      devPts = (int)MathRound(MathAbs(reqPrice - cmd.entry)/pt);
   }

   g_ctx_symbol=sym;
   g_ctx_side=cmd.side;
   g_ctx_signal_price=cmd.entry;
   g_ctx_req_price=reqPrice;
   g_ctx_spread_pts=spreadPts;
   g_ctx_dev_pts=devPts;
   g_ctx_comment=cmd.comment;

   
// Effective MaxSpread (points): MaxSpreadPoints overrides MaxSpreadPips (pips->points using 10 points = 1 pip)
int effMaxPts = 0;
if(MaxSpreadPoints > 0) effMaxPts = MaxSpreadPoints;
else if(MaxSpreadPips > 0.0) effMaxPts = (int)MathRound(MaxSpreadPips * 10.0);

if(effMaxPts > 0 && spreadPts > effMaxPts) return false;

// Effective entry tolerance (points). If SpreadCompensation is ON, widen tolerance by current spread + extra margin
int effTolPts = EntryTolerancePoints;
if(SpreadCompensation)
{
   int extraPts = spreadPts + (int)MathCeil(SpreadExtraPips * 10.0);
   effTolPts += extraPts;
}
if(devPts > effTolPts) return false;

   return true;
}

bool PlaceMarket3(const SBCommand &cmd){
   // In MT5 the chart symbol rules (user decision): execution ALWAYS uses the chart symbol.
   string sym = _Symbol;
   SymbolSelect(sym,true);
   LogLine(StringFormat("SB SYMBOL | signal=%s exec=%s", cmd.symbol, sym));

   // SL/TP prices
   double pt=SymbolInfoDouble(sym,SYMBOL_POINT);
   double ask=0,bid=0;
   SymbolInfoDouble(sym,SYMBOL_ASK,ask);
   SymbolInfoDouble(sym,SYMBOL_BID,bid);
   double price = (cmd.side=="BUY") ? ask : bid;

   int sl_pips = cmd.sl_pips;
   if(UseFixedSL) sl_pips = FixedSL_Pips;
   if(UseSLMultiplier) sl_pips = (int)MathRound(sl_pips * SL_Multiplier);
   sl_pips += SL_ExtraPips;

   double sl_dist = PipToPrice(sym, sl_pips);
   double sl = (cmd.side=="BUY") ? price - sl_dist : price + sl_dist;

   double tp1 = (cmd.side=="BUY") ? price + PipToPrice(sym, cmd.tp1_pips) : price - PipToPrice(sym, cmd.tp1_pips);
   double tp2 = (cmd.side=="BUY") ? price + PipToPrice(sym, cmd.tp2_pips) : price - PipToPrice(sym, cmd.tp2_pips);
   double tp3 = (cmd.side=="BUY") ? price + PipToPrice(sym, cmd.tp3_pips) : price - PipToPrice(sym, cmd.tp3_pips);

   double lots_total = CalcLotsByRisk(sym, sl_pips);
   // Split logic (like MT4 behavior): try 3 orders, if lots too small, reduce count
   double vmin=SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN);
   int n=3;
   double per = NormalizeVolume(sym, lots_total/n);
   if(per < vmin){
      n=2; per = NormalizeVolume(sym, lots_total/n);
      if(per < vmin){
         n=1; per = NormalizeVolume(sym, lots_total);
      }
   }

   trade.SetExpertMagicNumber(MAGIC);
   trade.SetDeviationInPoints(SLIPPAGE);

   bool ok=true;
   for(int i=1;i<=n;i++){
      double tp = (i==1)?tp1: (i==2?tp2:tp3);
      string cmt = StringFormat("SoftiBridge|%s|TP%d", cmd.id, i);
      bool r=false;
      if(cmd.side=="BUY") r = trade.Buy(per, sym, 0.0, sl, tp, cmt);
      else               r = trade.Sell(per, sym, 0.0, sl, tp, cmt);
      if(!r){
         ok=false;
         LogLine(StringFormat("SB EXEC FAIL | sym=%s side=%s ret=%d err=%d", sym, cmd.side, (int)trade.ResultRetcode(), GetLastError()));
      } else {
         LogLine(StringFormat("SB EXEC | sym=%s | side=%s | signal=%.2f | req=%.2f | exec=%.2f | spread_pts=%d | dev_pts=%+d | ticket=%I64d | %s",
            sym, cmd.side, cmd.entry, g_ctx_req_price, trade.ResultPrice(), g_ctx_spread_pts, (cmd.side=="BUY"? +g_ctx_dev_pts: -g_ctx_dev_pts),
            trade.ResultDeal(), cmt
         ));
      }
   }
   return ok;
}

// --- Pending-order mode (MT4-like) ---
// If price is not yet within EntryTolerance, we place pending orders immediately so the user can see them in MT5.
// Orders are set with broker-side expiration = TimeCurrent() + EntryMaxWaitSeconds.
// SpreadCompensation is applied by shifting the pending entry price by current spread (+ optional SpreadExtraPips).
bool PlacePending3(const SBCommand &cmd){
   string sym = cmd.symbol;
   if(sym=="" || !SymbolSelect(sym,true)) sym = _Symbol;

   // Ensure we can trade the symbol
   if(!SymbolSelect(sym,true)){
      Print(StringFormat("[SB] ❌ symbol not selectable: %s", sym));
      return false;
   }

   // Current bid/ask
   double bid=0.0, ask=0.0;
   if(!SymbolInfoDouble(sym,SYMBOL_BID,bid) || !SymbolInfoDouble(sym,SYMBOL_ASK,ask) || bid<=0.0 || ask<=0.0){
      Print(StringFormat("[SB] ❌ bid/ask not ready for %s", sym));
      return false;
   }

   // Spread in points
   int spreadPts = (int)SymbolInfoInteger(sym,SYMBOL_SPREAD);
   if(spreadPts<0) spreadPts=0;

   // Extra margin in points
   int extraPts = 0;
   if(SpreadExtraPips>0.0) extraPts = SB_PipsToPoints(sym, SpreadExtraPips);

   // Entry shift (points) when SpreadCompensation is enabled
   int shiftPts = 0;
   if(SpreadCompensation) shiftPts = spreadPts + extraPts;

   // Adjust entry price to compensate spread (BUY => higher price, SELL => lower price)
   double entry = cmd.entry;
   if(cmd.side==SB_BUY)  entry += (double)shiftPts * _Point;
   if(cmd.side==SB_SELL) entry -= (double)shiftPts * _Point;

   // SL uses cmd.sl_pips plus SL_ExtraPips (ONLY SL)
   int slPts = SB_PipsToPoints(sym, cmd.sl_pips + SL_ExtraPips);
   if(slPts<=0) slPts = SB_PipsToPoints(sym, cmd.sl_pips);

   double sl = 0.0;
   if(cmd.side==SB_BUY)  sl = entry - (double)slPts * _Point;
   if(cmd.side==SB_SELL) sl = entry + (double)slPts * _Point;

   // TPs
   double tp1=0.0,tp2=0.0,tp3=0.0;
   if(cmd.tp1_pips>0){ int tpPts=SB_PipsToPoints(sym, cmd.tp1_pips); tp1 = (cmd.side==SB_BUY)? entry + (double)tpPts*_Point : entry - (double)tpPts*_Point; }
   if(cmd.tp2_pips>0){ int tpPts=SB_PipsToPoints(sym, cmd.tp2_pips); tp2 = (cmd.side==SB_BUY)? entry + (double)tpPts*_Point : entry - (double)tpPts*_Point; }
   if(cmd.tp3_pips>0){ int tpPts=SB_PipsToPoints(sym, cmd.tp3_pips); tp3 = (cmd.side==SB_BUY)? entry + (double)tpPts*_Point : entry - (double)tpPts*_Point; }

   // Lot sizing and split (same as market)
   double lotsTotal = CalcLotsFromRisk(sym, cmd, sl);
   if(lotsTotal<=0.0){ Print("[SB] ❌ lots <= 0"); return false; }
   double lotsEach = NormalizeLots(sym, lotsTotal/3.0);
   if(lotsEach<=0.0) lotsEach = NormalizeLots(sym, lotsTotal);

   // MaxSpread filter (points)
   int effMaxPts = 0;
   if(MaxSpreadPoints>0) effMaxPts = MaxSpreadPoints;
   else if(MaxSpreadPips>0.0) effMaxPts = (int)MathRound(MaxSpreadPips*10.0);
   if(effMaxPts>0 && spreadPts>effMaxPts){
      Print(StringFormat("[SB] 🚫 MaxSpread exceeded: spreadPts=%d > %d", spreadPts, effMaxPts));
      return false;
   }

   // Decide pending type based on entry relative to current price
   bool useStop=false;
   if(cmd.side==SB_BUY)  useStop = (entry > ask);
   if(cmd.side==SB_SELL) useStop = (entry < bid);

   // Expiration
   datetime exp = (datetime)(TimeCurrent() + (int)EntryMaxWaitSeconds);
   ENUM_ORDER_TYPE_TIME ttype = ORDER_TIME_SPECIFIED;

   CTrade trade;
   trade.SetExpertMagicNumber(MAGIC);
   trade.SetDeviationInPoints(SLIPPAGE);

   bool ok=true;
   string c1=StringFormat("%s-PND-TP1", cmd.comment);
   string c2=StringFormat("%s-PND-TP2", cmd.comment);
   string c3=StringFormat("%s-PND-TP3", cmd.comment);

   // Place 1..3 pending orders (skip TP if 0)
   if(tp1>0.0){
      bool r=false;
      if(cmd.side==SB_BUY)  r = (useStop? trade.BuyStop(lotsEach, entry, sym, sl, tp1, ttype, exp, c1) : trade.BuyLimit(lotsEach, entry, sym, sl, tp1, ttype, exp, c1));
      if(cmd.side==SB_SELL) r = (useStop? trade.SellStop(lotsEach, entry, sym, sl, tp1, ttype, exp, c1) : trade.SellLimit(lotsEach, entry, sym, sl, tp1, ttype, exp, c1));
      if(!r){ ok=false; Print(StringFormat("[SB] ❌ pending TP1 failed err=%d", GetLastError())); ResetLastError(); }
   }
   if(tp2>0.0){
      bool r=false;
      if(cmd.side==SB_BUY)  r = (useStop? trade.BuyStop(lotsEach, entry, sym, sl, tp2, ttype, exp, c2) : trade.BuyLimit(lotsEach, entry, sym, sl, tp2, ttype, exp, c2));
      if(cmd.side==SB_SELL) r = (useStop? trade.SellStop(lotsEach, entry, sym, sl, tp2, ttype, exp, c2) : trade.SellLimit(lotsEach, entry, sym, sl, tp2, ttype, exp, c2));
      if(!r){ ok=false; Print(StringFormat("[SB] ❌ pending TP2 failed err=%d", GetLastError())); ResetLastError(); }
   }
   if(tp3>0.0){
      bool r=false;
      if(cmd.side==SB_BUY)  r = (useStop? trade.BuyStop(lotsEach, entry, sym, sl, tp3, ttype, exp, c3) : trade.BuyLimit(lotsEach, entry, sym, sl, tp3, ttype, exp, c3));
      if(cmd.side==SB_SELL) r = (useStop? trade.SellStop(lotsEach, entry, sym, sl, tp3, ttype, exp, c3) : trade.SellLimit(lotsEach, entry, sym, sl, tp3, ttype, exp, c3));
      if(!r){ ok=false; Print(StringFormat("[SB] ❌ pending TP3 failed err=%d", GetLastError())); ResetLastError(); }
   }

   Print(StringFormat("[SB] ✅ pending placed sym=%s side=%s entry=%.2f useStop=%s exp=%s spreadPts=%d shiftPts=%d", sym, (cmd.side==SB_BUY?"BUY":"SELL"), entry, (useStop?"YES":"NO"), TimeToString(exp, TIME_SECONDS), spreadPts, shiftPts));
   return ok;
}

bool SB_ClearQueueIfLastLineMatches(const string expectedLine){
   string all = SB_ReadQueueSmartCommon("softibridge/inbox/cmd_queue_mt5.txt");
   if(all=="") return false;
   string last = SB_LastNonEmptyLine(all);
   if(last=="" || last=="0") return false;
   if(last != expectedLine) return false;

   int h = FileOpen("softibridge/inbox/cmd_queue_mt5.txt", FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(h==INVALID_HANDLE){
      LogLine(StringFormat("❌ [IO] clear queue failed err=%d", GetLastError()));
      ResetLastError();
      return false;
   }
   FileWriteString(h, "0\n");
   FileClose(h);
   LogLine("✅ [IO] cmd_queue_mt5 cleared");
   return true;
}

void ArmWait(const SBCommand &cmd, const string rawLine){
   g_waiting=true;
   g_wait_cmd=cmd;
   g_wait_rawline=rawLine;
   g_wait_deadline = TimeCurrent() + EntryMaxWaitSeconds;
   LogLine(StringFormat("SB WAIT ARM | sym=%s side=%s signal=%.2f maxWait=%ds", cmd.symbol, cmd.side, cmd.entry, EntryMaxWaitSeconds));
}

void ProcessWait(){
   if(!g_waiting) return;
   datetime now = TimeCurrent();
   if(now > g_wait_deadline){
      LogLine(StringFormat("SB WAIT TIMEOUT | sym=%s side=%s signal=%.2f", g_wait_cmd.symbol, g_wait_cmd.side, g_wait_cmd.entry));
      g_waiting=false;
      if(g_wait_rawline!="") SB_ClearQueueIfLastLineMatches(g_wait_rawline);
      g_wait_rawline="";
      return;
   }
   int spr=0, dev=0; double req=0;
   if(EntryConditionsOk(g_wait_cmd, spr, dev, req)){
      LogLine(StringFormat("SB WAIT OK | sym=%s side=%s spread=%d dev=%d -> EXEC", g_wait_cmd.symbol, g_wait_cmd.side, spr, dev));
      bool ok = PlaceMarket3(g_wait_cmd);
      if(ok && g_wait_rawline!="") SB_ClearQueueIfLastLineMatches(g_wait_rawline);
      g_waiting=false;
      g_wait_rawline="";
   }
}

bool SB_IsBridgePositionByTicket(const ulong ticket)
{
   if(!PositionSelectByTicket(ticket)) return false;
   long magic = (long)PositionGetInteger(POSITION_MAGIC);
   if(magic != MAGIC) return false;
   string cmt = PositionGetString(POSITION_COMMENT);
   if(StringFind(cmt, "SoftiBridge") < 0) return false;
   return true;
}

bool SB_ModifyPositionTicket(const ulong ticket, const double newSL, const double newTP, const bool doSL, const bool doTP)
{
   if(!SB_IsBridgePositionByTicket(ticket)) return false;
   double curSL = PositionGetDouble(POSITION_SL);
   double curTP = PositionGetDouble(POSITION_TP);
   double sl = doSL ? newSL : curSL;
   double tp = doTP ? newTP : curTP;
   if(!trade.PositionModify(ticket, sl, tp))
   {
      LogLine(StringFormat("[CTRL] PositionModify failed ticket=%I64u ret=%d err=%d", ticket, (int)trade.ResultRetcode(), GetLastError()));
      ResetLastError();
      return false;
   }
   return true;
}

int SB_ModifyAllPositions(const int filterType, const double newSL, const double newTP, const bool doSL, const bool doTP)
{
   int changed = 0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      string psym = PositionGetString(POSITION_SYMBOL);
      if(psym != _Symbol) continue;
      long magic = (long)PositionGetInteger(POSITION_MAGIC);
      if(magic != MAGIC) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, "SoftiBridge") < 0) continue;
      long type = PositionGetInteger(POSITION_TYPE);
      if(filterType==1 && type!=POSITION_TYPE_BUY) continue;
      if(filterType==2 && type!=POSITION_TYPE_SELL) continue;
      if(SB_ModifyPositionTicket(ticket, newSL, newTP, doSL, doTP)) changed++;
   }
   return changed;
}

bool SB_CloseOrCancelTicket(const ulong ticket)
{
   if(PositionSelectByTicket(ticket))
   {
      long magicPos = (long)PositionGetInteger(POSITION_MAGIC);
      string cmtPos = PositionGetString(POSITION_COMMENT);
      if(magicPos == MAGIC && StringFind(cmtPos, "SoftiBridge") >= 0)
         return trade.PositionClose(ticket);
      return false;
   }
   if(OrderSelect(ticket))
   {
      long magic = (long)OrderGetInteger(ORDER_MAGIC);
      string cmt = OrderGetString(ORDER_COMMENT);
      if(magic == MAGIC && StringFind(cmt, "SoftiBridge") >= 0)
      {
         return trade.OrderDelete(ticket);
      }
   }
   return false;
}

int SB_CancelPendingFiltered(const int filterType)
{
   int deleted=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(!OrderSelect(ticket)) continue;
      long magic = (long)OrderGetInteger(ORDER_MAGIC);
      if(magic != MAGIC) continue;
      string sym = OrderGetString(ORDER_SYMBOL);
      if(sym != _Symbol) continue;
      string cmt = OrderGetString(ORDER_COMMENT);
      if(StringFind(cmt, "SoftiBridge") < 0) continue;
      ENUM_ORDER_TYPE t = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      bool isBuy = (t==ORDER_TYPE_BUY_LIMIT || t==ORDER_TYPE_BUY_STOP || t==ORDER_TYPE_BUY_STOP_LIMIT);
      bool isSell = (t==ORDER_TYPE_SELL_LIMIT || t==ORDER_TYPE_SELL_STOP || t==ORDER_TYPE_SELL_STOP_LIMIT);
      if(filterType==1 && !isBuy) continue;
      if(filterType==2 && !isSell) continue;
      if(trade.OrderDelete(ticket)) deleted++;
   }
   return deleted;
}

void SB_WriteBridgeStateSnapshotMT5()
{
   int hp = FileOpen("softibridge/state/positions_mt5.txt", FILE_WRITE|FILE_TXT|FILE_COMMON);
   int ho = FileOpen("softibridge/state/pending_mt5.txt", FILE_WRITE|FILE_TXT|FILE_COMMON);
   if(hp==INVALID_HANDLE || ho==INVALID_HANDLE)
   {
      if(hp!=INVALID_HANDLE) FileClose(hp);
      if(ho!=INVALID_HANDLE) FileClose(ho);
      return;
   }
   int posCnt=0, penCnt=0;
   double pnl=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      string psym = PositionGetString(POSITION_SYMBOL);
      if(psym != _Symbol) continue;
      long magic = (long)PositionGetInteger(POSITION_MAGIC);
      if(magic != MAGIC) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, "SoftiBridge") < 0) continue;
      posCnt++;
      long type = PositionGetInteger(POSITION_TYPE);
      string side = (type==POSITION_TYPE_SELL ? "SELL" : "BUY");
      double pr = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      pnl += pr;
      string line = "platform=MT5;ticket="+(string)ticket+
                    ";symbol="+psym+
                    ";side="+side+
                    ";type="+IntegerToString((int)type)+
                    ";lots="+DoubleToString(PositionGetDouble(POSITION_VOLUME),2)+
                    ";open="+DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), (int)SymbolInfoInteger(psym, SYMBOL_DIGITS))+
                    ";sl="+DoubleToString(PositionGetDouble(POSITION_SL), (int)SymbolInfoInteger(psym, SYMBOL_DIGITS))+
                    ";tp="+DoubleToString(PositionGetDouble(POSITION_TP), (int)SymbolInfoInteger(psym, SYMBOL_DIGITS))+
                    ";pnl="+DoubleToString(pr,2)+
                    ";comment="+cmt;
      FileWrite(hp, line);
   }
   for(int j=OrdersTotal()-1;j>=0;j--)
   {
      ulong otk = OrderGetTicket(j);
      if(otk == 0) continue;
      if(!OrderSelect(otk)) continue;
      string sym = OrderGetString(ORDER_SYMBOL);
      if(sym != _Symbol) continue;
      long magic = (long)OrderGetInteger(ORDER_MAGIC);
      if(magic != MAGIC) continue;
      string cmt = OrderGetString(ORDER_COMMENT);
      if(StringFind(cmt, "SoftiBridge") < 0) continue;
      penCnt++;
      ENUM_ORDER_TYPE t = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      string side2 = (t==ORDER_TYPE_SELL_LIMIT || t==ORDER_TYPE_SELL_STOP || t==ORDER_TYPE_SELL_STOP_LIMIT) ? "SELL" : "BUY";
      int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      string pl = "platform=MT5;ticket="+(string)otk+
                  ";symbol="+sym+
                  ";side="+side2+
                  ";type="+IntegerToString((int)t)+
                  ";lots="+DoubleToString(OrderGetDouble(ORDER_VOLUME_CURRENT),2)+
                  ";price="+DoubleToString(OrderGetDouble(ORDER_PRICE_OPEN), dg)+
                  ";sl="+DoubleToString(OrderGetDouble(ORDER_SL), dg)+
                  ";tp="+DoubleToString(OrderGetDouble(ORDER_TP), dg)+
                  ";comment="+cmt;
      FileWrite(ho, pl);
   }
   FileClose(hp);
   FileClose(ho);
   int hs = FileOpen("softibridge/state/bridge_state_summary.txt", FILE_WRITE|FILE_READ|FILE_TXT|FILE_COMMON);
   if(hs!=INVALID_HANDLE)
   {
      FileWrite(hs, "ts="+IntegerToString((int)TimeCurrent()));
      FileWrite(hs, "mt5_positions="+IntegerToString(posCnt));
      FileWrite(hs, "mt5_pending="+IntegerToString(penCnt));
      FileWrite(hs, "mt5_floating_pnl="+DoubleToString(pnl,2));
      FileClose(hs);
   }
}

bool ExecuteRemoteControlMT5(const SBCommand &cmd, string &outMsg)
{
   string action = cmd.action;
   string filt = cmd.filter;
   int filterType = 0;
   if(filt=="BUY") filterType = 1;
   else if(filt=="SELL") filterType = 2;

   if(action=="CLOSE_TICKET" || action=="CANCEL_TICKET")
   {
      if(cmd.ticket<=0){ outMsg="CTRL_BAD_TICKET"; return false; }
      bool ok = SB_CloseOrCancelTicket((ulong)cmd.ticket);
      outMsg = ok ? ("CTRL_"+action+"_OK") : ("CTRL_"+action+"_FAIL");
      return ok;
   }
   if(action=="CLOSE_ALL" || action=="CLOSE_BUY" || action=="CLOSE_SELL")
   {
      if(cmd.ticket>0)
      {
         bool okTicket = SB_CloseOrCancelTicket((ulong)cmd.ticket);
         outMsg = okTicket ? "CTRL_CLOSE_TICKET_OK" : "CTRL_CLOSE_TICKET_FAIL";
         return okTicket;
      }
      CloseFiltered(filterType);
      outMsg = "CTRL_"+action+"_OK";
      return true;
   }
   if(action=="CANCEL_ALL" || action=="CANCEL_BUY" || action=="CANCEL_SELL")
   {
      if(cmd.ticket>0)
      {
         bool okTicket2 = SB_CloseOrCancelTicket((ulong)cmd.ticket);
         outMsg = okTicket2 ? "CTRL_CANCEL_TICKET_OK" : "CTRL_CANCEL_TICKET_FAIL";
         return okTicket2;
      }
      int d = SB_CancelPendingFiltered(filterType);
      outMsg = "CTRL_"+action+"_OK deleted="+IntegerToString(d);
      return true;
   }
   if(action=="SET_SLTP" || action=="SET_SL" || action=="SET_TP")
   {
      bool doSL = (action=="SET_SLTP" || action=="SET_SL");
      bool doTP = (action=="SET_SLTP" || action=="SET_TP");
      bool ok = false;
      if(cmd.ticket>0) ok = SB_ModifyPositionTicket((ulong)cmd.ticket, cmd.sl_price, cmd.tp_price, doSL, doTP);
      else ok = (SB_ModifyAllPositions(filterType, cmd.sl_price, cmd.tp_price, doSL, doTP) >= 0);
      outMsg = ok ? ("CTRL_"+action+"_OK") : ("CTRL_"+action+"_FAIL");
      return ok;
   }
   if(action=="MOVE_BE")
   {
      // MT5 minimal remote support: break-even not implemented in this patch.
      outMsg = "CTRL_MOVE_BE_UNSUPPORTED_MT5";
      return false;
   }
   if(action=="MOVE_SL")
   {
      outMsg = "CTRL_MOVE_SL_UNSUPPORTED_MT5";
      return false;
   }
   outMsg = "CTRL_UNKNOWN_ACTION";
   return false;
}

// ----------------------------
// MT5 Entry Points
// ----------------------------
int OnInit(){trade.SetExpertMagicNumber(MAGIC);
   trade.SetDeviationInPoints(SLIPPAGE);
   UI_CreatePanel();
   EventSetMillisecondTimer(EntryCheckMs);
   LogLine("SoftiBridge MT5 v3.17 BINREAD LASTLINE started");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason){
   EventKillTimer();
   UI_DestroyPanel();
}

void OnTimer(){
   // fast wait processing
   ProcessWait();
   static datetime lastSnapTs=0;
   datetime nowTs = TimeCurrent();
   if(nowTs != lastSnapTs)
   {
      SB_WriteBridgeStateSnapshotMT5();
      lastSnapTs = nowTs;
   }

   // read newest command line; if changed, arm/exec
   string line="";
   if(!ReadNewestQueueLine(line)) return;

   SBCommand cmd;
   if(!ParseKVLine(line, cmd)) return;

   // If already waiting for same id, ignore
   if(g_waiting && cmd.id==g_wait_cmd.id) return;

   if(cmd.mode=="CTRL")
   {
      string ctrlMsg="";
      bool ctrlOk = ExecuteRemoteControlMT5(cmd, ctrlMsg);
      LogLine(StringFormat("[CTRL] id=%s action=%s ok=%s msg=%s", cmd.id, cmd.action, (ctrlOk?"YES":"NO"), ctrlMsg));
      if(ctrlOk) SB_ClearQueueIfLastLineMatches(line);
      return;
   }

   int spr=0, dev=0; double req=0;
   if(EntryConditionsOk(cmd, spr, dev, req)){
      bool ok = PlaceMarket3(cmd);
      if(ok) SB_ClearQueueIfLastLineMatches(line);
   } else {
      // MT4-like visibility: place pending orders immediately (then broker will expire them after EntryMaxWaitSeconds).
      bool ok = PlacePending3(cmd);
      if(ok) SB_ClearQueueIfLastLineMatches(line);
   }
}

void OnTick(){
   // ultra-fast recheck while waiting
   if(g_waiting) ProcessWait();
}
