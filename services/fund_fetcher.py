"""Confirmed-NAV acquisition. No JavaScript execution. CDN -> AKShare/Sina fallback."""
from __future__ import annotations
import datetime as dt
import json
import math
import re
import time
import urllib.request

VERSION = "0.1.0"

def get(url: str, attempts: int = 3) -> str:
    error = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": f"FundSentinel/{VERSION}", "Referer": "https://fund.eastmoney.com/"})
            with urllib.request.urlopen(request, timeout=18) as response:
                raw = response.read(8_000_001)
                if len(raw) > 8_000_000:
                    raise ValueError("NAV response exceeds size limit")
                return raw.decode("utf-8-sig")
        except Exception as exc:
            error = exc
            if attempt + 1 < attempts:
                time.sleep(attempt + 1)
    raise RuntimeError("NAV source unavailable") from error

def assignment(source: str, name: str):
    match = re.search(r"\b" + re.escape(name) + r"\s*=\s*", source)
    if not match:
        raise ValueError(f"Missing {name}")
    return json.JSONDecoder().raw_decode(source[match.end():])[0]

def positive(value) -> float:
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError("Invalid NAV")
    return number

def parse_cdn(code: str, source: str) -> dict:
    zone = dt.timezone(dt.timedelta(hours=8))
    def date(value):
        return dt.datetime.fromtimestamp(float(value) / 1000, zone).date().isoformat()
    # The source occasionally publishes null cumulative NAV for a few dates; derive them instead of failing the fund.
    cumulative = {date(t): positive(v) for t, v in assignment(source, "Data_ACWorthTrend") if v is not None and float(v) > 0}
    points = {}
    for raw in assignment(source, "Data_netWorthTrend"):
        day = date(raw["x"])
        rate = raw.get("equityReturn")
        rate = float(rate) if rate is not None else None
        if rate is not None and not math.isfinite(rate):
            rate = None
        points[day] = {"date": day, "nav": positive(raw["y"]), "acc": cumulative.get(day), "daily": rate, "dividend": str(raw.get("unitMoney") or "").strip(), "adj": None}
    history = sorted(points.values(), key=lambda p: p["date"])
    if not history:
        raise ValueError("Empty NAV history")
    for index, point in enumerate(history):
        if point["acc"] is None:
            previous = history[index - 1] if index else None
            point["acc"] = previous["acc"] + point["nav"] - previous["nav"] if previous and not point["dividend"] else point["nav"]
    reliable = True
    adjusted = history[0]["nav"]
    for index, point in enumerate(history):
        if index:
            if not point["dividend"]:
                adjusted *= point["nav"] / history[index - 1]["nav"]
            elif point["daily"] is not None and point["daily"] > -100:
                adjusted *= 1 + point["daily"] / 100
            else:
                reliable = False
        point["adj"] = adjusted if reliable else None
    return {"code": code, "name": str(assignment(source, "fS_name")), "type": "公募基金", "source": "天天基金 · 盘后披露", "history": history, "adjustmentReliable": reliable, "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat()}

def fetch_akshare(code: str) -> dict:
    import akshare as ak
    # Sina NAV is an actual secondary provider exposed by AKShare; it has no reliable adjusted curve.
    frame = ak.fund_open_fund_info_em(symbol=code, indicator="单位净值走势")
    acc = ak.fund_open_fund_info_em(symbol=code, indicator="累计净值走势")
    adjusted = ak.fund_open_fund_info_em(symbol=code, indicator="累计收益率走势", period="成立来")
    cumulative = {str(row.iloc[0])[:10]: positive(row.iloc[1]) for _, row in acc.iterrows() if float(row.iloc[1]) > 0}
    returns = {str(row.iloc[0])[:10]: float(row.iloc[1]) for _, row in adjusted.iterrows()}
    points = []
    for _, row in frame.iterrows():
        day = str(row.iloc[0])[:10]
        if day not in cumulative:
            continue
        points.append({"date": day, "nav": positive(row.iloc[1]), "acc": cumulative[day], "adj": 1 + returns[day] / 100 if day in returns else None, "daily": None, "dividend": ""})
    if not points:
        raise ValueError("AKShare NAV is empty")
    points.sort(key=lambda p: p["date"])
    # Fallback lacks corporate-action text: block personal rules until explicit calibration.
    points[-1]["dividend"] = "备用源无法确认除权信息，请核对份额与成本"
    return {"code": code, "name": code, "type": "公募基金", "source": "AKShare · 东方财富备用", "history": points, "adjustmentReliable": all(p["adj"] is not None for p in points), "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat()}

def fetch_sina(code: str) -> dict:
    points = []
    for page in range(1, 101):
        data = json.loads(get(f"https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/CaihuiFundInfoService.getNav?symbol={code}&datefrom=&dateto=&page={page}&num=200"))
        result = data["result"]
        if result["status"]["code"] != 0:
            raise ValueError("Sina NAV provider rejected request")
        rows = result["data"]["data"]
        for row in rows:
            points.append({"date": row["fbrq"][:10], "nav": positive(row["jjjz"]), "acc": positive(row["ljjz"]), "adj": None, "daily": None, "dividend": ""})
        if not rows or len(points) >= int(result["data"]["total_num"]):
            break
    if not points:
        raise ValueError("Sina NAV is empty")
    points.sort(key=lambda p: p["date"])
    points[-1]["dividend"] = "新浪备用源缺少分红与复权元数据，请核对份额与成本"
    return {"code": code, "name": code, "type": "公募基金", "source": "新浪公开净值备用（复权指标暂停）", "history": points, "adjustmentReliable": False, "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat()}

def fetch_fund(code: str) -> dict:
    if not re.fullmatch(r"\d{6}", code):
        raise ValueError("Expected six-digit fund code")
    errors = []
    for getter in (lambda: parse_cdn(code, get(f"https://fund.eastmoney.com/pingzhongdata/{code}.js")), lambda: fetch_akshare(code), lambda: fetch_sina(code)):
        try:
            fund = getter()
            if fund["history"][-1]["date"] > dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat():
                raise ValueError("Future NAV rejected")
            return fund
        except Exception as exc:
            errors.append(type(exc).__name__)
    raise RuntimeError(f"{code}: all confirmed-NAV sources failed ({', '.join(errors)})")

def get_historical_peak_nav(fund_code: str, start_date: str | None = None) -> dict:
    history = fetch_fund(fund_code)["history"]
    points = [p for p in history if p["date"] >= start_date] if start_date else history[-60:]
    if not points:
        raise ValueError("No NAV in requested holding interval")
    return max(points, key=lambda p: p["nav"])
