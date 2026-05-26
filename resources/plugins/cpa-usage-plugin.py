#!/usr/bin/env python3
# UsageBoardPlugin:
# {
#   "schemaVersion": 1,
#   "name": "CPA",
#   "name@zh-Hans": "CPA 额度",
#   "name@en": "CPA Quota",
#   "description": "Get quota from Claude/Codex/Gemini/Antigravity/Kimi via CPA-Manager",
#   "description@zh-Hans": "通过 CPA-Manager 获取 Claude/Codex/Gemini/Antigravity/Kimi 额度",
#   "description@en": "Get quota from Claude/Codex/Gemini/Antigravity/Kimi via CPA-Manager",
#   "parameters": [
#     {
#       "name": "cpa_mgmt_url",
#       "label": "CPA-Manager URL",
#       "label@zh-Hans": "CPA-Manager 地址",
#       "label@en": "CPA-Manager URL",
#       "type": "string",
#       "required": false,
#       "defaultValue": "",
#       "placeholder": "http://host:port"
#     },
#     {
#       "name": "cpa_mgmt_key",
#       "label": "Management Key",
#       "label@zh-Hans": "管理密钥",
#       "label@en": "Management Key",
#       "type": "secret",
#       "required": true,
#       "placeholder": "CPA-Manager management key"
#     },
#     {
#       "name": "monitor_claude",
#       "label": "Monitor Claude",
#       "label@zh-Hans": "监控 Claude",
#       "label@en": "Monitor Claude",
#       "type": "boolean",
#       "required": false,
#       "defaultValue": "true"
#     },
#     {
#       "name": "monitor_codex",
#       "label": "Monitor Codex",
#       "label@zh-Hans": "监控 Codex",
#       "label@en": "Monitor Codex",
#       "type": "boolean",
#       "required": false,
#       "defaultValue": "true"
#     },
#     {
#       "name": "monitor_gemini",
#       "label": "Monitor Gemini",
#       "label@zh-Hans": "监控 Gemini",
#       "label@en": "Monitor Gemini",
#       "type": "boolean",
#       "required": false,
#       "defaultValue": "true"
#     },
#     {
#       "name": "monitor_antigravity",
#       "label": "Monitor Antigravity",
#       "label@zh-Hans": "监控 Antigravity",
#       "label@en": "Monitor Antigravity",
#       "type": "boolean",
#       "required": false,
#       "defaultValue": "true"
#     },
#     {
#       "name": "monitor_kimi",
#       "label": "Monitor Kimi",
#       "label@zh-Hans": "监控 Kimi",
#       "label@en": "Monitor Kimi",
#       "type": "boolean",
#       "required": false,
#       "defaultValue": "true"
#     }
#   ]
# }
# /UsageBoardPlugin
"""UsageBoard plugin: fetch quota from Claude/Codex/Gemini/Antigravity/Kimi via CPA-Manager."""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from _common import (  # noqa: E402
    app_language,
    color_for_pct,
    failure,
    make_translator,
    parse_usageboard_params,
    status_for,
    success,
)

# Provider registry: maps provider name → (parser, needs_client, monitor_param)
PROVIDER_REGISTRY: dict[str, dict[str, Any]] = {}

ANTIGRAVITY_URLS = [
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
]


# ─── Email extraction from auth file name ──────────────────────────────────────


def extract_email(name: str) -> str:
    """Extract email from auth file name like 'claude-user@example.com.json'."""
    base = name.rsplit("/", 1)[-1]
    base = re.sub(r"\.json$", "", base)
    parts = base.split("-", 1)
    if len(parts) < 2:
        return base
    email_part = parts[1]
    # Codex hex prefix: '251bae8c-user@example.com' → strip leading hex
    email_part = re.sub(r"^[0-9a-f]{8,10}-", "", email_part)
    # Codex plan suffixes: '-plus', '-pro', '-teamHEX'
    email_part = re.sub(r"-(?:plus|pro|team[0-9a-f]*|free)$", "", email_part)
    return email_part


# ─── CPA-Manager HTTP helpers ──────────────────────────────────────────────────


def cpa_api_call(
    client: Any,
    base_url: str,
    mgmt_key: str,
    method: str,
    url: str,
    auth_index: str,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Proxy an API call through CPA-Manager. Returns {'status_code': ..., 'body': ...}."""
    payload: dict[str, Any] = {
        "method": method,
        "url": url,
        "auth_index": auth_index,
        "header": headers,
    }
    if body is not None:
        payload["data"] = json.dumps(body)
    resp = client.post(
        f"{base_url}/v0/management/api-call",
        json=payload,
        headers={"Authorization": f"Bearer {mgmt_key}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def cpa_get_auth_files(client: Any, base_url: str, mgmt_key: str) -> list[dict[str, Any]]:
    """Fetch the list of auth files from CPA-Manager."""
    resp = client.get(
        f"{base_url}/v0/management/auth-files",
        headers={"Authorization": f"Bearer {mgmt_key}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("files", [])


def load_code_assist_project(client: Any, base_url: str, mgmt_key: str, auth_index: str) -> str:
    """Step 1 for Gemini/Antigravity: get cloudaicompanionProject via loadCodeAssist."""
    result = cpa_api_call(
        client, base_url, mgmt_key,
        "POST",
        "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
        auth_index,
        {"Authorization": "Bearer $TOKEN$", "Content-Type": "application/json"},
        {},
    )
    status = result.get("status_code", 0)
    if status < 200 or status >= 300:
        return ""
    body = result.get("body", "{}")
    if isinstance(body, str):
        body = json.loads(body)
    return body.get("cloudaicompanionProject", "")


# ─── Provider parsers ──────────────────────────────────────────────────────────


def parse_claude(
    body: dict[str, Any],
    email: str,
) -> list[dict[str, Any]]:
    """Parse Claude OAuth usage response. Returns list of items."""
    items: list[dict[str, Any]] = []
    for period_key, label in [("five_hour", "5小时"), ("seven_day", "每周")]:
        period = body.get(period_key)
        if not isinstance(period, dict):
            continue
        raw_util = period.get("utilization", 0)
        pct = float(raw_util) * 100 if float(raw_util) <= 1 else float(raw_util)
        pct = min(pct, 100)
        reset_at = (
            period.get("resets_at")
            or period.get("resetsAt")
            or period.get("reset_time")
            or period.get("resetTime")
        )
        items.append({
            "id": f"claude:{email}:{label}",
            "name": f"Claude ({email}) · {label}",
            "used": round(pct, 1),
            "limit": 100.0,
            "displayStyle": "percent",
            "resetAt": reset_at,
            "status": status_for(pct, 100),
            "color": color_for_pct(pct),
        })
    return items


def parse_codex(
    body: dict[str, Any],
    email: str,
) -> list[dict[str, Any]]:
    """Parse Codex usage response. Returns list of items."""
    items: list[dict[str, Any]] = []
    rate_limit = body.get("rate_limit") or body.get("rateLimit", {})
    for window_key, label in [("primary_window", "5小时"), ("secondary_window", "每周")]:
        window = rate_limit.get(window_key) or rate_limit.get(
            window_key.replace("_", ""), {}
        )
        if not isinstance(window, dict):
            continue
        if "used_percent" not in window and "usedPercent" not in window:
            continue
        pct = float(window.get("used_percent") or window.get("usedPercent", 0))
        raw_reset = window.get("reset_at") or window.get("resetAt")
        reset_at_iso = None
        if raw_reset is not None:
            ts = float(raw_reset)
            if ts < 1e12:
                ts *= 1000
            from datetime import datetime, timezone
            reset_at_iso = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        elif window.get("reset_after_seconds") is not None:
            from datetime import datetime, timezone, timedelta
            reset_at_iso = (
                datetime.now(timezone.utc) + timedelta(seconds=float(window["reset_after_seconds"]))
            ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        items.append({
            "id": f"codex:{email}:{label}",
            "name": f"Codex ({email}) · {label}",
            "used": round(pct, 1),
            "limit": 100.0,
            "displayStyle": "percent",
            "resetAt": reset_at_iso,
            "status": status_for(pct, 100),
            "color": color_for_pct(pct),
        })
    return items


def parse_gemini_buckets(
    body: dict[str, Any],
    email: str,
) -> list[dict[str, Any]]:
    """Parse Gemini retrieveUserQuota response. Returns list of items."""
    items: list[dict[str, Any]] = []
    buckets = body.get("buckets", [])
    for bucket in buckets:
        model_id = bucket.get("modelId", "unknown")
        token_type = bucket.get("tokenType", "")
        remaining = float(bucket.get("remainingFraction", 1.0))
        if remaining <= 1:
            remaining *= 100
        used_pct = max(0, 100 - remaining)
        used_pct = min(used_pct, 100)
        reset_at = bucket.get("resetTime") or bucket.get("reset_time")
        label = f"{model_id} {token_type}".strip() if token_type else model_id
        items.append({
            "id": f"gemini:{email}:{label}",
            "name": f"Gemini ({email}) · {label}",
            "used": round(used_pct, 1),
            "limit": 100.0,
            "displayStyle": "percent",
            "resetAt": reset_at,
            "status": status_for(used_pct, 100),
            "color": color_for_pct(used_pct),
        })
    return items


def parse_antigravity_models(
    body: dict[str, Any],
    email: str,
) -> list[dict[str, Any]]:
    """Parse Antigravity fetchAvailableModels response. Returns list of items."""
    items: list[dict[str, Any]] = []
    models = body.get("models", {})
    for model_id, model_info in models.items():
        quota_info = model_info.get("quotaInfo") or model_info.get("quota_info")
        if not isinstance(quota_info, dict):
            continue
        remaining = float(quota_info.get("remainingFraction", 1.0))
        if remaining <= 1:
            remaining *= 100
        used_pct = max(0, 100 - remaining)
        used_pct = min(used_pct, 100)
        reset_at = quota_info.get("resetTime") or quota_info.get("reset_time")
        display_name = model_info.get("displayName", model_id)
        items.append({
            "id": f"antigravity:{email}:{model_id}",
            "name": f"Antigravity ({email}) · {display_name}",
            "used": round(used_pct, 1),
            "limit": 100.0,
            "displayStyle": "percent",
            "resetAt": reset_at,
            "status": status_for(used_pct, 100),
            "color": color_for_pct(used_pct),
        })
    return items


def parse_kimi(
    body: dict[str, Any],
    email: str,
) -> list[dict[str, Any]]:
    """Parse Kimi usage response. Returns list of items."""
    items: list[dict[str, Any]] = []
    limits = body.get("limits", [])
    for limit_entry in limits:
        used = float(limit_entry.get("used", 0))
        total = float(limit_entry.get("limit", 0))
        if total <= 0:
            continue
        pct = (used / total) * 100
        name = limit_entry.get("name", "")
        title = limit_entry.get("title", name)
        duration = limit_entry.get("duration")
        time_unit = limit_entry.get("timeUnit", "")
        if duration and time_unit:
            period_label = f"{duration} {time_unit}"
        else:
            period_label = title or name
        reset_at = (
            limit_entry.get("reset_at")
            or limit_entry.get("resetAt")
            or limit_entry.get("detail", {}).get("resetAt")
        )
        items.append({
            "id": f"kimi:{email}:{period_label}",
            "name": f"Kimi ({email}) · {period_label}",
            "used": round(pct, 1),
            "limit": 100.0,
            "displayStyle": "percent",
            "resetAt": reset_at,
            "status": status_for(pct, 100),
            "color": color_for_pct(pct),
        })
    return items


# ─── Provider-specific fetching logic ─────────────────────────────────────────


def _parse_api_result(result: dict[str, Any]) -> dict[str, Any]:
    """Check status_code and parse body from CPA-Manager api-call response."""
    status = result.get("status_code", 0)
    if status < 200 or status >= 300:
        raise RuntimeError(f"Upstream API returned HTTP {status}")
    body = result.get("body", "{}")
    if isinstance(body, str):
        body = json.loads(body)
    return body


def fetch_claude_quota(
    client: Any, base_url: str, mgmt_key: str, auth_index: str,
) -> dict[str, Any]:
    result = cpa_api_call(
        client, base_url, mgmt_key,
        "GET",
        "https://api.anthropic.com/api/oauth/usage",
        auth_index,
        {
            "Authorization": "Bearer $TOKEN$",
            "Content-Type": "application/json",
            "anthropic-beta": "oauth-2025-04-20",
        },
    )
    return _parse_api_result(result)


def fetch_codex_quota(
    client: Any, base_url: str, mgmt_key: str, auth_index: str,
) -> dict[str, Any]:
    result = cpa_api_call(
        client, base_url, mgmt_key,
        "GET",
        "https://chatgpt.com/backend-api/wham/usage",
        auth_index,
        {
            "Authorization": "Bearer $TOKEN$",
            "Content-Type": "application/json",
            "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal",
        },
    )
    return _parse_api_result(result)


def fetch_gemini_quota(
    client: Any, base_url: str, mgmt_key: str, auth_index: str,
) -> dict[str, Any]:
    project = load_code_assist_project(client, base_url, mgmt_key, auth_index)
    body_payload: dict[str, Any] = {}
    if project:
        body_payload["project"] = project
    result = cpa_api_call(
        client, base_url, mgmt_key,
        "POST",
        "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
        auth_index,
        {"Authorization": "Bearer $TOKEN$", "Content-Type": "application/json"},
        body_payload,
    )
    return _parse_api_result(result)


def fetch_antigravity_quota(
    client: Any, base_url: str, mgmt_key: str, auth_index: str,
) -> dict[str, Any]:
    project = load_code_assist_project(client, base_url, mgmt_key, auth_index)
    body_payload: dict[str, Any] = {}
    if project:
        body_payload["project"] = project

    last_error: Exception | None = None
    for url in ANTIGRAVITY_URLS:
        try:
            result = cpa_api_call(
                client, base_url, mgmt_key,
                "POST",
                url,
                auth_index,
                {
                    "Authorization": "Bearer $TOKEN$",
                    "Content-Type": "application/json",
                    "User-Agent": "antigravity/1.11.5 windows/amd64",
                },
                body_payload,
            )
            return _parse_api_result(result)
        except Exception as exc:
            last_error = exc
            continue
    raise last_error or RuntimeError("All Antigravity URLs failed")


def fetch_kimi_quota(
    client: Any, base_url: str, mgmt_key: str, auth_index: str,
) -> dict[str, Any]:
    result = cpa_api_call(
        client, base_url, mgmt_key,
        "GET",
        "https://api.kimi.com/coding/v1/usages",
        auth_index,
        {"Authorization": "Bearer $TOKEN$"},
    )
    return _parse_api_result(result)


# ─── Main ──────────────────────────────────────────────────────────────────────


def _load_env_local() -> dict[str, str]:
    """Load key=value pairs from .env.local in the project root."""
    env: dict[str, str] = {}
    candidates = [
        os.path.join(os.path.dirname(os.path.realpath(__file__)), "..", "..", ".env.local"),
        os.path.join(os.getcwd(), ".env.local"),
    ]
    for path in candidates:
        path = os.path.normpath(path)
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        env[k.strip()] = v.strip()
            break
    return env


def main() -> int:
    params = parse_usageboard_params(sys.argv[1:])
    language = app_language(params)
    translate = make_translator({
        "missing_mgmt_url": {
            "zh-Hans": "请在插件设置中配置 CPA-Manager 地址",
            "en": "Please configure CPA-Manager URL in plugin settings",
        },
        "auth_files_failed": {
            "zh-Hans": "获取账号列表失败",
            "en": "Failed to fetch auth file list",
        },
        "all_accounts_failed": {
            "zh-Hans": "所有账号获取失败",
            "en": "All accounts failed",
        },
    })

    env = _load_env_local()
    mgmt_url = params.get("cpa_mgmt_url")
    if mgmt_url is None:
        mgmt_url = env.get("CPA_MGMT_URL", "")
    if not mgmt_url:
        return failure(translate(language, "missing_mgmt_url"))
    mgmt_key = params.get("cpa_mgmt_key")
    if mgmt_key is None:
        mgmt_key = env.get("CPA_MGMT_KEY", "")
    if not mgmt_key:
        return failure(translate(language, "missing_api_key"))

    try:
        import httpx  # noqa: F811
    except ImportError:
        print(json.dumps({"error": "需要安装 httpx: pip install httpx / httpx is required: pip install httpx"}))
        return 0

    monitor_flags = {
        "claude": params.get("monitor_claude", "true").lower() == "true",
        "codex": params.get("monitor_codex", "true").lower() == "true",
        "gemini-cli": params.get("monitor_gemini", "true").lower() == "true",
        "antigravity": params.get("monitor_antigravity", "true").lower() == "true",
        "kimi": params.get("monitor_kimi", "true").lower() == "true",
    }

    provider_fetchers: dict[str, Any] = {
        "claude": (fetch_claude_quota, parse_claude),
        "codex": (fetch_codex_quota, parse_codex),
        "gemini-cli": (fetch_gemini_quota, parse_gemini_buckets),
        "antigravity": (fetch_antigravity_quota, parse_antigravity_models),
        "kimi": (fetch_kimi_quota, parse_kimi),
    }

    with httpx.Client() as client:
        try:
            auth_files = cpa_get_auth_files(client, mgmt_url, mgmt_key)
        except Exception:
            return failure(translate(language, "auth_files_failed"))

        items: list[dict[str, Any]] = []
        warnings: list[str] = []

        for auth_file in auth_files:
            if auth_file.get("disabled", False):
                continue
            provider = auth_file.get("provider", "")
            auth_index = auth_file.get("auth_index", "")
            name = auth_file.get("name", "")
            email = extract_email(name)

            if not monitor_flags.get(provider, False):
                continue

            fetcher_info = provider_fetchers.get(provider)
            if not fetcher_info:
                continue

            fetcher, parser = fetcher_info
            try:
                body = fetcher(client, mgmt_url, mgmt_key, auth_index)
                account_items = parser(body, email)
                items.extend(account_items)
            except Exception as exc:
                warnings.append(f"{provider}({email}): {exc}")

        if items:
            return success(items)
        if warnings:
            return failure("; ".join(warnings))
        return success(items)


if __name__ == "__main__":
    sys.exit(main())
