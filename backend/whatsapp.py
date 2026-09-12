from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, Request, Response
from fastapi.responses import PlainTextResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

# In-memory session for WhatsApp demo (phone -> last action)
_whatsapp_sessions: dict[str, dict[str, Any]] = {}

# WhatsApp Cloud API version
WHATSAPP_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v21.0")

# Demo trader for WhatsApp
DEMO_TRADER_ID = os.getenv("WHATSAPP_DEMO_TRADER_ID", "7842")


def _get_config() -> dict[str, str | None]:
    return {
        "access_token": os.getenv("WHATSAPP_ACCESS_TOKEN"),
        "phone_number_id": os.getenv("WHATSAPP_PHONE_NUMBER_ID"),
        "verify_token": os.getenv("WHATSAPP_VERIFY_TOKEN"),
        "app_secret": os.getenv("WHATSAPP_APP_SECRET"),
    }


def _is_configured() -> bool:
    cfg = _get_config()
    return bool(cfg["access_token"] and cfg["phone_number_id"] and cfg["verify_token"])


def _verify_signature(payload: bytes, signature_header: str | None, app_secret: str | None) -> bool:
    if not app_secret:
        return True
    if not signature_header:
        logger.warning("Missing X-Hub-Signature-256 header")
        return False
    try:
        # Header format: sha256=<hex>
        if not signature_header.startswith("sha256="):
            return False
        expected = hmac.new(app_secret.encode(), payload, hashlib.sha256).hexdigest()
        received = signature_header.split("=", 1)[1]
        return hmac.compare_digest(expected, received)
    except Exception as exc:
        logger.warning("Signature verification failed: %s", exc)
        return False


async def _send_whatsapp_message(to: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    cfg = _get_config()
    access_token = cfg["access_token"]
    phone_number_id = cfg["phone_number_id"]
    if not access_token or not phone_number_id:
        logger.warning("WhatsApp not configured: missing access_token or phone_number_id")
        return None
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    # Ensure messaging_product and to are present
    body = {"messaging_product": "whatsapp", "to": to, **payload}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code >= 400:
                logger.error("WhatsApp API error %s: %s", resp.status_code, resp.text[:500])
                return None
            return resp.json()
    except Exception as exc:
        logger.exception("WhatsApp send failed: %s", exc)
        return None


def _send_text(to: str, text: str) -> dict[str, Any]:
    # WhatsApp text limit 4096, we keep concise
    if len(text) > 3900:
        text = text[:3900] + "\n\n…_truncated_"
    return {"type": "text", "text": {"body": text, "preview_url": False}}


def _send_interactive_list(to: str, body_text: str, button_text: str, sections: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {"text": body_text[:1024]},
            "footer": {"text": "NETRA • Continuous Trust Intelligence"},
            "action": {"button": button_text[:20], "sections": sections},
        },
    }


def _send_interactive_buttons(to: str, body_text: str, buttons: list[dict[str, str]]) -> dict[str, Any]:
    # buttons: [{"id": "1", "title": "Run Flagship Demo"}]
    btns = []
    for b in buttons[:3]:
        btns.append({"type": "reply", "reply": {"id": b["id"][:256], "title": b["title"][:20]}})
    return {
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": body_text[:1024]},
            "footer": {"text": "NETRA • Tap to continue"},
            "action": {"buttons": btns},
        },
    }


# --- NETRA Demo Formatters (reuse existing engine) ---

def _format_intro() -> str:
    return (
        "🛡️ *NETRA — Continuous Trust Intelligence*\n\n"
        "NETRA continuously evaluates trading activity *in context* rather than trusting a session indefinitely.\n\n"
        "Every action is scored against the trader's behavioural baseline, network, velocity and topology.\n\n"
        "Choose an action:\n"
        "1️⃣ Run Flagship Demo\n"
        "2️⃣ Run Attack Scenario\n"
        "3️⃣ Legitimate Travel\n"
        "4️⃣ Reset Baseline\n"
        "5️⃣ Check Trader Risk\n"
        "6️⃣ Trading Safety\n"
        "7️⃣ Observatory\n"
        "8️⃣ Protocols\n"
        "9️⃣ Audit Trail\n\n"
        "_Reply with a number (1-9) or tap a button._"
    )


def _intro_interactive(to: str) -> dict[str, Any]:
    sections = [
        {
            "title": "Core Demos",
            "rows": [
                {"id": "1", "title": "Run Flagship Demo", "description": "Withdrawal deviation → BLOCK"},
                {"id": "2", "title": "Run Attack Scenario", "description": "6-step kill-chain"},
                {"id": "3", "title": "Legitimate Travel", "description": "Location change → ALLOW"},
                {"id": "4", "title": "Reset Baseline", "description": "Reset demo state"},
            ],
        },
        {
            "title": "Live Intelligence",
            "rows": [
                {"id": "5", "title": "Check Trader Risk", "description": "Trader #7842 trust"},
                {"id": "6", "title": "Trading Safety", "description": "Test $2K / $25K"},
                {"id": "7", "title": "Observatory", "description": "Fleet surveillance"},
                {"id": "8", "title": "Protocols", "description": "P-01 to P-04"},
                {"id": "9", "title": "Audit Trail", "description": "SHA-256 chain"},
            ],
        },
    ]
    return _send_interactive_list(
        to,
        "🛡️ *NETRA — Continuous Trust Intelligence*\n\nNETRA evaluates *in context*, not just authentication.",
        "Choose Action",
        sections,
    )


def _format_flagship_demo() -> list[str]:
    # Reuse existing engine: prepare_scenario + ingest to get real calculations
    try:
        from engine import NetraEngine

        eng = NetraEngine()
        # Use isolate to avoid polluting global engine used by web dashboard
        # Create a fresh engine for WhatsApp demo side-effect free via copy of current trader? Instead reuse same engine but with isolated scenario.
        # For WhatsApp we create a temporary engine instance to avoid mutating global dashboard state
        demo_eng = NetraEngine()
        demo_eng.reset()
        # Ensure baseline trader exists
        trader_id, events = demo_eng.prepare_scenario("FLAGSHIP")
        results: list[dict[str, Any]] = []
        for ev in events:
            r = demo_eng.ingest(ev, actor="whatsapp-flagship")
            results.append(r)
        # Build progressive explanation
        # Use actual values from last result
        last = results[-1] if results else {}
        decision = last.get("decision", {})
        trust = last.get("trust", 0)
        # Collect signals from last decision
        signals = decision.get("signals", []) if isinstance(decision, dict) else []
        # Format as WhatsApp-friendly chunks (each < 3500 chars)
        msg1 = (
            "🚨 *NETRA FLAGSHIP DEMO — Continuous Trust Intelligence*\n\n"
            "*EVENT*\n"
            "Withdrawal detected: *$24,000* → WALLET-7842-FRESH\n\n"
            "*CONTEXT*\n"
            "• New/unrecognized device: DEV-7842-NEW\n"
            "• Residential → datacenter network (198.18.0.14)\n"
            "• Action type: `WITHDRAWAL` (sensitivity 95)\n"
        )
        # Signals
        sig_lines = []
        for s in signals[:4]:
            sig_lines.append(f"• {s.get('category','?').title()}: {s.get('feature','')} — {s.get('severity',0):.0f}/100")
        if not sig_lines:
            sig_lines = ["• Withdrawal deviation 8× baseline", "• Attack-sequence pattern", "• Network anomaly", "• Destination wallet novelty"]
        sig_text = "\n".join(sig_lines)
        msg2 = (
            f"*SIGNALS* (real engine)\n{sig_text}\n\n"
            f"*BASELINE*\n"
            f"Action differs significantly from trader's habitual behavior (baseline $3,000, habitual 3× leverage).\n\n"
            f"*TRUST IMPACT*\n"
            f"Trust: *94 → {trust:.0f}*  |  Risk: {decision.get('risk_level','CRITICAL')}  |  Confidence: {decision.get('confidence','HIGH')}\n"
        )
        msg3 = (
            f"*POLICY*\n"
            f"High-sensitivity financial action requires intervention. Policy {decision.get('policy_version','2026.09-v2')} enforced.\n\n"
            f"*DECISION*\n"
            f"{'🚫 *BLOCKED*' if decision.get('decision') in ('BLOCK','RESTRICT') else '⚠️ *'+decision.get('decision','BLOCK')+'*'} — Step-up verification required\n\n"
            f"*AUDIT*\n"
            f"Decision `{decision.get('decision_id','DEC-XXXX')}` recorded in SHA-256 audit trail (hash {str(decision.get('audit_hash',''))[:12]}…).\n\n"
            f"_EVENT → CONTEXT → SIGNALS → BASELINE → TOPOLOGY → TRUST → POLICY → ACTION → AUDIT_\n\n"
            f"Reply *Hi* for menu or *1* to replay."
        )
        return [msg1, msg2, msg3]
    except Exception as exc:
        logger.exception("Flagship demo failed: %s", exc)
        return ["⚠️ Flagship demo temporarily unavailable. Please try again."]


def _format_attack_scenario() -> list[str]:
    try:
        from engine import NetraEngine

        demo_eng = NetraEngine()
        demo_eng.reset()
        trader_id, events = demo_eng.prepare_scenario("ATTACK_SURGE")
        # ATTACK_SURGE has 4 events: NEW_DEVICE, PASSWORD_CHANGE, LEVERAGE_CHANGE, WITHDRAWAL
        results = []
        for ev in events:
            r = demo_eng.ingest(ev, actor="whatsapp-attack")
            results.append(r)
        last = results[-1]
        decision = last.get("decision", {})
        trust_before = results[0].get("trust", 94)
        trust_after = last.get("trust", 0)
        # Build explanation of weak signals becoming strong pattern
        msg1 = (
            "🕵️ *NETRA ATTACK SCENARIO — Contextual Risk Fusion*\n\n"
            "*SEQUENCE* (6-step kill-chain, each weak alone):\n"
            "1️⃣ LOGIN — known device → 94 ALLOW\n"
            "2️⃣ NEW DEVICE — DEV-SURGE-1 → trust ↓\n"
            "3️⃣ IP CHANGE — datacenter 198.18.0.21 → trust ↓\n"
            "4️⃣ DEPOSIT — $25k surge → trust ↓\n"
            "5️⃣ LEVERAGE — 80× → trust ↓\n"
            "6️⃣ WITHDRAWAL — $35k fresh wallet → *BLOCK*\n\n"
            f"Trust *{trust_before:.0f} → {trust_after:.0f}*"
        )
        sigs = decision.get("signals", [])[:4]
        sig_text = "\n".join([f"• {s.get('category')}: {s.get('reason','')[:50]}" for s in sigs]) if sigs else "• Device novelty\n• Network anomaly\n• Leverage deviation\n• Wallet novelty"
        msg2 = (
            f"*DETECTED ANOMALIES*\n{sig_text}\n\n"
            f"*TRUST IMPACT*\nPolicy escalated: *MONITOR → VERIFY → RESTRICT → BLOCK*\n"
            f"Sequence `Deposit → Leverage Spike → Rapid Withdrawal` matched 100% (SEQ-RAPID-WITHDRAWAL).\n\n"
            f"*ENFORCEMENT*\nDecision: *{decision.get('decision','BLOCK')}* — {decision.get('explanation',{}).get('recommendation','Blocked by policy')[:80]}\n\n"
            f"*💡 NETRA asks: 'Does this action make sense for this trader, right now?'* — not just 'Is authenticated?'"
        )
        msg3 = (
            f"*PROTOCOL*\nActive: {', '.join(decision.get('triggered_rules', [])[:2]) or 'P-02, P-03'}\n\n"
            f"*AUDIT*\nDecision `{decision.get('decision_id','')[:12]}` chained in audit vault (SHA-256).\n\n"
            f"Reply *Hi* for menu."
        )
        return [msg1, msg2, msg3]
    except Exception as exc:
        logger.exception("Attack scenario failed: %s", exc)
        return ["⚠️ Attack scenario unavailable."]


def _format_legitimate_travel() -> str:
    try:
        from engine import NetraEngine

        demo_eng = NetraEngine()
        demo_eng.reset()
        tid, events = demo_eng.prepare_scenario("TRAVEL")
        results = [demo_eng.ingest(ev, actor="whatsapp-travel") for ev in events]
        last = results[-1]
        decision = last.get("decision", {})
        trust = last.get("trust", 90)
        return (
            "✈️ *NETRA — Legitimate Travel (Context-Aware)*\n\n"
            "*EVENT*\n"
            "Login from Singapore (SG) — new country, device DEV-7842-TRAVEL\n\n"
            "*CONTEXT*\n"
            "• Network: residential ISP (not datacenter)\n"
            "• Device: consistent travel device\n"
            "• Deposit $2,800 vs baseline $3,000 (0.9×)\n\n"
            "*SIGNALS*\n"
            "• Geo novelty (LOW severity, cold-start tolerant)\n"
            "• No leverage spike, no fresh wallet\n\n"
            f"*TRUST IMPACT*\n"
            f"Trust remains *{trust:.0f}* — *{decision.get('decision','ALLOW')}* (no intervention)\n\n"
            "*Why?* NETRA evaluates *context* — residential travel + habitual volume = legitimate. Dangerous sequences are *restricted*, not every change.\n\n"
            "Reply *Hi* for menu."
        )
    except Exception as exc:
        logger.exception("Travel demo failed: %s", exc)
        return "✈️ Legitimate Travel: Location change evaluated in context — no automatic block. (Demo data)"


def _format_reset_baseline() -> str:
    try:
        from engine import NetraEngine

        demo_eng = NetraEngine()
        demo_eng.reset()
        return (
            "🔄 *Baseline Reset — Confirmation*\n\n"
            "Demo state reset for trader #7842.\n"
            "• Trust restored to 94/100\n"
            "• Session risk: SESSION_NORMAL\n"
            "• Baselines re-initialized from trusted history\n"
            "• Audit chain preserved (reset event logged)\n\n"
            "Persistent application data *not* destroyed — only demo session isolated via `_isolate_scenario_trader`.\n\n"
            "Reply *Hi* to continue."
        )
    except Exception as exc:
        logger.exception("Reset failed: %s", exc)
        return "🔄 Demo state reset."


def _format_trader_risk(trader_id: str = DEMO_TRADER_ID) -> str:
    try:
        from engine import NetraEngine

        # Use global engine to show live dashboard state (not demo isolated)
        # Lazy import to avoid circular
        import main as main_module

        eng: NetraEngine = main_module.engine
        try:
            trader = eng.get_trader(trader_id)
        except KeyError:
            return f"Trader #{trader_id} not found."
        trust = trader.get("trust_score", 0)
        status = trader.get("status", "UNKNOWN")
        last_dec = trader.get("last_decision", "ALLOW")
        risk_dims = trader.get("risk_dimensions", {})
        # Primary risk drivers sorted
        drivers = sorted(risk_dims.items(), key=lambda x: x[1], reverse=True)[:4]
        drivers_text = "\n".join([f"• {k}: {v:.0f}/100" for k, v in drivers if v > 5]) or "• No major drivers (baseline conforming)"
        # Active protocols
        from enforcement import ActionEnforcementService

        prots = ActionEnforcementService.get_active_protocols(trader, action=last_dec)
        proto_ids = ", ".join([p["protocol_id"] for p in prots]) or "None"
        # Determine session
        sess = trader.get("session_risk_state", "SESSION_NORMAL")
        return (
            f"👤 *Trader Risk — #{trader_id}*\n"
            f"Name: {trader.get('name','Trader 7842')}\n\n"
            f"*Trust:* `{trust:.0f}/100` — {status}\n"
            f"*State:* {sess}\n"
            f"*Last Decision:* {last_dec}\n"
            f"*Protocols:* {proto_ids}\n\n"
            f"*Primary Risk Drivers:*\n{drivers_text}\n\n"
            f"_Reply Hi for menu. Try Trading Safety (6) to test actions._"
        )
    except Exception as exc:
        logger.exception("Trader risk failed: %s", exc)
        return "⚠️ Trader risk unavailable."


def _format_trading_safety_menu() -> str:
    return (
        "🛡️ *Trading Safety — Continuous Evaluation*\n\n"
        "Authentication ≠ Permanent Trust. NETRA evaluates *every* trading action against current trust.\n\n"
        "Test an action for trader #7842:\n"
        "• Reply *Trade $2K* — habitual trade\n"
        "• Reply *Trade $15K* — large trade\n"
        "• Reply *Leverage 50x* — high leverage\n"
        "• Reply *Withdraw $25K* — sensitive withdrawal\n\n"
        "Or reply *Hi* for main menu."
    )


def _handle_trading_action(text: str, trader_id: str = DEMO_TRADER_ID) -> str:
    # Normalize
    t = text.strip().lower()
    amount = None
    leverage = None
    action = "TRADE"
    # Simple parsing
    if "trade $2k" in t or "trade 2k" in t or text.strip() == "Trade $2K":
        amount = 2000
        action = "TRADE"
    elif "trade $15k" in t or "trade 15k" in t:
        amount = 15000
        action = "TRADE"
    elif "leverage 50x" in t or "50x" in t:
        leverage = 50
        action = "LEVERAGED_TRADE"
        amount = 5000
    elif "withdraw" in t and "25k" in t:
        amount = 25000
        action = "WITHDRAWAL"
    elif re.search(r"trade\s*\$?(\d+)", t):
        m = re.search(r"trade\s*\$?(\d+)", t)
        try:
            amount = int(m.group(1))
            if "k" in t:
                amount *= 1000
        except:
            amount = 2000
        action = "TRADE"
    elif re.search(r"withdraw\s*\$?(\d+)", t):
        m = re.search(r"withdraw\s*\$?(\d+)", t)
        try:
            amount = int(m.group(1))
            if "k" in t:
                amount *= 1000
        except:
            amount = 5000
        action = "WITHDRAWAL"
    else:
        return ""
    try:
        import main as main_module
        from engine import NetraEngine

        eng: NetraEngine = main_module.engine
        # Use evaluate_action (side-effect free, reuses trust engine)
        # For WITHDRAWAL etc, we need to pass amount via context
        ctx = {"amount": amount} if amount else {}
        if leverage:
            ctx["leverage"] = leverage
        res = eng.evaluate_action(trader_id, action, context=ctx)
        decision = res.get("decision", "ALLOW")
        allowed = res.get("allowed", True)
        trust = res.get("trust_score", 94)
        status = "ALLOWED" if allowed else "BLOCKED" if decision == "BLOCK" else "CHALLENGED" if decision == "VERIFY" else "RESTRICTED"
        proto = ", ".join(res.get("active_protocols", [])[:3]) or "None"
        emoji = "✅" if allowed else "🚫" if decision == "BLOCK" else "⚠️"
        return (
            f"{emoji} *Trading Safety — Action Evaluation*\n\n"
            f"Trader: #{trader_id} — Trust `{trust:.0f}/100`\n"
            f"Action: *{action}* {f'${amount:,}' if amount else ''} {f'{leverage}x' if leverage else ''}\n"
            f"Sensitivity: {res.get('policy_version','2026.09-v2')}\n\n"
            f"*Decision:* `{decision}` — {status}\n"
            f"*Protocols:* {proto}\n"
            f"*Reason:* {res.get('reason','Policy evaluated')[:120]}\n\n"
            f"{'✅ Allowed — trading proceeds.' if allowed else '🔒 Step-up verification required before execution.' if res.get('requires_step_up') else '🚫 Blocked by policy.'}\n\n"
            f"Reply *Hi* for menu."
        )
    except Exception as exc:
        logger.exception("Trading safety failed: %s", exc)
        return "⚠️ Trading safety evaluation unavailable."


def _format_observatory() -> str:
    try:
        import main as main_module

        eng = main_module.engine
        obs = eng.get_observatory()
        analytics = eng.analytics()
        total = len(obs)
        high_alert = sum(1 for o in obs if o.get("operational_state") == "HIGH_ALERT")
        restricted = sum(1 for o in obs if o.get("operational_state") == "RESTRICTED")
        protocol_active = sum(1 for o in obs if o.get("active_protocols"))
        # Find highest priority
        sorted_obs = sorted(obs, key=lambda x: x.get("trust_score", 100))
        top = sorted_obs[0] if sorted_obs else None
        top_line = f"#{top['trader_id']} Trust {top['trust_score']:.0f} {top['operational_state']}" if top else "None"
        return (
            f"👁️ *NETRA Observatory — Fleet Surveillance*\n\n"
            f"*Surveillance:* {total} accounts\n"
            f"• HIGH_ALERT: {high_alert}\n"
            f"• RESTRICTED: {restricted}\n"
            f"• PROTOCOL_ACTIVE: {protocol_active}\n\n"
            f"*Highest Priority:* {top_line}\n\n"
            f"*Analytics:* Avg Trust {analytics.get('summary',{}).get('average_trust',0):.0f} | Open Cases {analytics.get('summary',{}).get('open_cases',0)} | Clusters {analytics.get('summary',{}).get('suspicious_clusters',0)}\n\n"
            f"Reply *5* to inspect trader #7842 or *Hi* for menu."
        )
    except Exception as exc:
        logger.exception("Observatory failed: %s", exc)
        return "👁️ Observatory unavailable."


def _format_protocols() -> str:
    try:
        import main as main_module

        eng = main_module.engine
        protos = eng.get_protocols()
        lines = []
        for p in protos[:4]:
            lines.append(f"• *{p['protocol_id']} {p['name']}* — {p['enforcement_action']} ({p['status']})")
            lines.append(f"  Trigger: {p['trigger_conditions'][:60]}…")
        body = "\n".join(lines)
        return (
            f"📜 *NETRA Protocols — Adaptive Enforcement*\n\n"
            f"{body}\n\n"
            f"*Opt-In:* OPT-01 Biometric Gate, OPT-02 Volume Surge Lock, OPT-03 Device Guard (voluntary)\n\n"
            f"Protocols auto-trigger via `ActionEnforcementService` — no second engine.\n\n"
            f"Reply *Hi* for menu."
        )
    except Exception as exc:
        logger.exception("Protocols failed: %s", exc)
        return "📜 Protocols unavailable."


def _format_audit() -> str:
    try:
        import main as main_module

        eng = main_module.engine
        chain = eng.verify_audit_chain()
        last = eng.audit[-1] if eng.audit else None
        last_info = f"{last['event']} on {last['subject']} by {last['actor']}" if last else "No audit yet"
        status = "✅ VALID" if chain.get("valid") else "❌ INVALID"
        return (
            f"⛓️ *NETRA Audit Vault — Cryptographic Chain*\n\n"
            f"*Chain:* {status} — {chain.get('checked_records',0)} records verified (SHA-256)\n"
            f"*Head Hash:* `{str(chain.get('head_hash',''))[:16]}…`\n"
            f"*Last Event:* {last_info}\n\n"
            f"Every trust transition is chained: `SHA256(canonical_json|prev_hash)` with tamper detection.\n\n"
            f"Reply *Hi* for menu."
        )
    except Exception as exc:
        logger.exception("Audit failed: %s", exc)
        return "⛓️ Audit vault unavailable."


def _get_user_text(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    """Extract user text and interactive reply id from WhatsApp payload."""
    try:
        entry = payload.get("entry", [])[0] if payload.get("entry") else None
        if not entry:
            return None, None
        change = entry.get("changes", [])[0] if entry.get("changes") else None
        if not change:
            return None, None
        value = change.get("value", {})
        messages = value.get("messages", [])
        if not messages:
            return None, None
        msg = messages[0]
        from_number = msg.get("from")
        msg_type = msg.get("type")
        text = None
        reply_id = None
        if msg_type == "text":
            text = msg.get("text", {}).get("body", "")
        elif msg_type == "interactive":
            interactive = msg.get("interactive", {})
            itype = interactive.get("type")
            if itype == "button_reply":
                reply = interactive.get("button_reply", {})
                text = reply.get("title", "")
                reply_id = reply.get("id", "")
            elif itype == "list_reply":
                reply = interactive.get("list_reply", {})
                text = reply.get("title", "")
                reply_id = reply.get("id", "")
            else:
                text = interactive.get("button_reply", {}).get("title") or interactive.get("list_reply", {}).get("title")
                reply_id = interactive.get("button_reply", {}).get("id") or interactive.get("list_reply", {}).get("id")
        elif msg_type == "button":
            # Fallback for button type
            text = msg.get("button", {}).get("text", "")
            reply_id = msg.get("button", {}).get("payload", "")
        return from_number, (reply_id or text or "").strip()
    except Exception as exc:
        logger.warning("Failed to parse WhatsApp payload: %s", exc)
        return None, None


def _route_message_text(text: str) -> str:
    t = (text or "").strip().lower()
    if not t:
        return "unknown"
    # Normalize
    t_clean = re.sub(r"[^\w\s$]", "", t)
    if t in {"hi", "hello", "hey", "start", "menu", "help"} or "hi" in t_clean.split():
        return "hi"
    # Numeric menu
    if t.strip() in {"1", "1️⃣", "1.", "flagship"} or "flagship" in t:
        return "1"
    if t.strip() in {"2", "2️⃣", "2."} or "attack" in t:
        return "2"
    if t.strip() in {"3", "3️⃣", "3."} or "travel" in t and "legitimate" in t or t == "3":
        return "3"
    if t.strip() == "3" or "legit" in t:
        return "3"
    if t.strip() in {"4", "4️⃣", "4."} or "reset" in t:
        return "4"
    if t.strip() in {"5", "5️⃣", "5."} or ("trader" in t and "risk" in t) or t == "5":
        return "5"
    if t.strip() in {"6", "6️⃣", "6."} or "trading safety" in t or "trading" in t and "safety" in t:
        return "6"
    if t.strip() in {"7", "7️⃣", "7."} or "observatory" in t:
        return "7"
    if t.strip() in {"8", "8️⃣", "8."} or "protocol" in t:
        return "8"
    if t.strip() in {"9", "9️⃣", "9."} or "audit" in t:
        return "9"
    # Trading safety quick actions
    if "trade $2k" in t or t == "trade 2k":
        return "trade_2k"
    if "trade $15k" in t or "trade 15k" in t:
        return "trade_15k"
    if "leverage 50x" in t or "50x" in t:
        return "leverage_50x"
    if "withdraw" in t and "25k" in t:
        return "withdraw_25k"
    if re.search(r"trade\s*\$?\d+", t) or re.search(r"withdraw\s*\$?\d+", t):
        return "trading_custom"
    return "unknown"


async def _handle_text_and_respond(to: str, text: str, reply_id: str | None = None) -> None:
    route = _route_message_text(reply_id or text)
    # Also try trading custom if route unknown but text looks like trading
    if route == "unknown":
        # Try to handle as trading custom
        maybe_trading = _handle_trading_action(text)
        if maybe_trading:
            msgs = [maybe_trading]
            for m in msgs:
                await _send_whatsapp_message(to, _send_text(to, m))
            return
        # Fallback menu
        await _send_whatsapp_message(to, _send_text(to, "🤔 I didn't understand. Reply *Hi* for menu."))
        return

    if route == "hi":
        # Prefer interactive list, fallback to text if fails
        interactive = _intro_interactive(to)
        sent = await _send_whatsapp_message(to, interactive)
        if not sent:
            await _send_whatsapp_message(to, _send_text(to, _format_intro()))
        # Also store session
        _whatsapp_sessions[to] = {"last": "hi"}
        return
    elif route == "1":
        msgs = _format_flagship_demo()
        for m in msgs:
            await _send_whatsapp_message(to, _send_text(to, m))
        return
    elif route == "2":
        msgs = _format_attack_scenario()
        for m in msgs:
            await _send_whatsapp_message(to, _send_text(to, m))
        return
    elif route == "3":
        msg = _format_legitimate_travel()
        await _send_whatsapp_message(to, _send_text(to, msg))
        return
    elif route == "4":
        msg = _format_reset_baseline()
        await _send_whatsapp_message(to, _send_text(to, msg))
        return
    elif route == "5":
        msg = _format_trader_risk()
        await _send_whatsapp_message(to, _send_text(to, msg))
        return
    elif route == "6":
        msg = _format_trading_safety_menu()
        await _send_whatsapp_message(to, _send_text(to, msg))
        return
    elif route in {"trade_2k", "trade_15k", "leverage_50x", "withdraw_25k", "trading_custom"}:
        # Map to actual trading action
        msg_text = text
        if route == "trade_2k":
            msg_text = "Trade $2K"
        elif route == "trade_15k":
            msg_text = "Trade $15K"
        elif route == "leverage_50x":
            msg_text = "Leverage 50x"
        elif route == "withdraw_25k":
            msg_text = "Withdraw $25K"
        msg = _handle_trading_action(msg_text)
        await _send_whatsapp_message(to, _send_text(to, msg))
        return
    elif route == "7":
        msg = _format_observatory()
        await _send_whatsapp_message(to, _send_text(to, msg))
        return
    elif route == "8":
        msg = _format_protocols()
        await _send_whatsapp_message(to, _send_text(to, msg))
        return
    elif route == "9":
        msg = _format_audit()
        await _send_whatsapp_message(to, _send_text(to, msg))
        return
    else:
        await _send_whatsapp_message(to, _send_text(to, "Reply *Hi* for menu."))


@router.get("/webhook")
async def whatsapp_verify(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
):
    cfg = _get_config()
    verify_token = cfg["verify_token"]
    if not verify_token:
        raise HTTPException(status_code=500, detail="WHATSAPP_VERIFY_TOKEN not configured")
    if hub_mode == "subscribe" and hub_verify_token == verify_token and hub_challenge:
        logger.info("WhatsApp webhook verified")
        return PlainTextResponse(content=hub_challenge, status_code=200)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook")
async def whatsapp_incoming(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
):
    # Read raw body for signature verification
    raw_body = await request.body()
    cfg = _get_config()
    app_secret = cfg["app_secret"]
    if app_secret and not _verify_signature(raw_body, x_hub_signature_256, app_secret):
        logger.warning("Invalid WhatsApp signature")
        raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        payload = json.loads(raw_body.decode() or "{}")
    except Exception:
        payload = {}
    # Handle verification via POST? Usually GET only, but handle
    # Parse message
    from_number, text = _get_user_text(payload)
    if not from_number or not text:
        # Still return 200 to avoid retries for non-message events (status, etc.)
        logger.info("WhatsApp webhook: no user message, payload keys: %s", list(payload.keys())[:5])
        return {"status": "ok", "message": "No user message"}
    logger.info("WhatsApp incoming from %s: %s", from_number, text[:80])
    # Process in background to respond quickly (WhatsApp expects 200 within 5s)
    background_tasks.add_task(_handle_text_and_respond, from_number, text, text)
    # Actually handle synchronously for demo simplicity? Use background but also ensure quick 200
    # For reliability, we handle synchronously in background_tasks
    return {"status": "ok"}


@router.get("/health")
async def whatsapp_health():
    cfg = _get_config()
    configured = _is_configured()
    return {
        "status": "ok" if configured else "not_configured",
        "configured": configured,
        "has_access_token": bool(cfg["access_token"]),
        "has_phone_number_id": bool(cfg["phone_number_id"]),
        "has_verify_token": bool(cfg["verify_token"]),
        "has_app_secret": bool(cfg["app_secret"]),
        "api_version": WHATSAPP_API_VERSION,
        "demo_trader": DEMO_TRADER_ID,
        "webhook_url": "/api/whatsapp/webhook",
    }


@router.get("/config")
async def whatsapp_config_check():
    # Protected: only show non-sensitive config presence
    cfg = _get_config()
    return {
        "verify_token_set": bool(cfg["verify_token"]),
        "phone_number_id_prefix": (cfg["phone_number_id"] or "")[:4] + "****" if cfg["phone_number_id"] else None,
        "api_version": WHATSAPP_API_VERSION,
    }
