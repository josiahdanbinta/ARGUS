from __future__ import annotations

import json
import smtplib
from email.mime.text import MIMEText

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


async def dispatch_channel(channel: dict, title: str, message: str, severity: str = "info") -> dict:
    """Dispatch a notification through a configured channel.

    channel: dict with keys {channel_type, config (dict)} from the DB.
    Falls back to global settings when a channel config is missing values.
    """
    channel_type = channel.get("channel_type")
    config = channel.get("config") or {}
    if not isinstance(config, dict):
        try:
            config = json.loads(config) if isinstance(config, str) else {}
        except (json.JSONDecodeError, TypeError):
            config = {}

    try:
        if channel_type == "email":
            return await _send_email(config, title, message, severity)
        if channel_type == "slack":
            return await _send_slack(config, title, message, severity)
        if channel_type == "sms":
            return await _send_sms(config, title, message, severity)
        raise ValueError(f"Unsupported channel type: {channel_type}")
    except Exception as e:
        logger.error("notification_dispatch_failed", channel=channel_type, error=str(e))
        return {"success": False, "channel": channel_type, "error": str(e)}


async def _send_email(config: dict, title: str, message: str, severity: str) -> dict:
    host = config.get("host") or settings.SMTP_HOST
    port = int(config.get("port") or settings.SMTP_PORT)
    user = config.get("user") or settings.SMTP_USER
    password = config.get("password") or settings.SMTP_PASSWORD
    sender = config.get("from") or settings.SMTP_FROM
    recipients = [r.strip() for r in config.get("to", "").split(",") if r.strip()]

    if not host or not recipients:
        raise ValueError("SMTP host and recipients required for email channel")

    body = MIMEText(message, "plain", "utf-8")
    body["Subject"] = f"[{severity.upper()}] {title}"
    body["From"] = sender
    body["To"] = ", ".join(recipients)

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=30)
        else:
            server = smtplib.SMTP(host, port, timeout=30)
            if settings.SMTP_USE_TLS:
                server.starttls()
        if user and password:
            server.login(user, password)
        server.sendmail(sender, recipients, body.as_string())
        server.quit()
        return {"success": True, "channel": "email", "recipients": recipients}
    except Exception as e:
        logger.error("email_send_failed", error=str(e))
        raise RuntimeError(f"Email send failed: {e}")


async def _send_slack(config: dict, title: str, message: str, severity: str) -> dict:
    webhook = config.get("webhook_url") or settings.SLACK_WEBHOOK_URL
    if not webhook:
        raise ValueError("Slack webhook URL required for slack channel")

    color = {
        "critical": "danger",
        "high": "warning",
        "medium": "warning",
        "low": "good",
        "info": "good",
    }.get(severity, "good")

    payload = {
        "channel": config.get("channel") or settings.SLACK_CHANNEL,
        "text": f"*[{severity.upper()}]* {title}",
        "attachments": [
            {
                "color": color,
                "title": title,
                "text": message[:2000],
                "mrkdwn_in": ["text"],
                "footer": "ARGUS SOAR",
            }
        ],
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(webhook, json=payload)
        resp.raise_for_status()
        return {"success": True, "channel": "slack", "status_code": resp.status_code}


async def _send_sms(config: dict, title: str, message: str, severity: str) -> dict:
    account_sid = config.get("account_sid") or settings.TWILIO_ACCOUNT_SID
    auth_token = config.get("auth_token") or settings.TWILIO_AUTH_TOKEN
    from_number = config.get("from_number") or settings.TWILIO_FROM_NUMBER
    to_number = config.get("to_number") or config.get("to")

    if not account_sid or not auth_token or not from_number or not to_number:
        raise ValueError("Twilio account SID, auth token, from and to numbers required for SMS channel")

    sms_text = f"ARGUS [{severity.upper()}]: {title} - {message[:200]}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
            data={"From": from_number, "To": to_number, "Body": sms_text},
            auth=(account_sid, auth_token),
        )
        resp.raise_for_status()
        return {"success": True, "channel": "sms", "sid": resp.json().get("sid")}
