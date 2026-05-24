#!/usr/bin/env python3
# UsageBoardPlugin:
# {
#   "schemaVersion": 1,
#   "name": "MiniMax",
#   "name@zh-Hans": "MiniMax",
#   "name@en": "MiniMax",
#   "icon": "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/minimax-color.png",
#   "description": "查询 MiniMax Coding Plan 用量",
#   "description@zh-Hans": "查询 MiniMax Coding Plan 用量",
#   "description@en": "Query MiniMax Coding Plan usage",
#   "parameters": [
#     {
#       "name": "API_KEY",
#       "label": "Api Key",
#       "label@zh-Hans": "Api Key",
#       "label@en": "API Key",
#       "type": "secret",
#       "required": true,
#       "placeholder": "MiniMax API Key"
#     }
#   ]
# }
# /UsageBoardPlugin
"""UsageBoard plugin for MiniMax Coding Plan quota usage."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from _common import (  # noqa: E402
    app_language,
    failure,
    handle_http_error,
    handle_url_error,
    make_translator,
    numeric,
    parse_usageboard_params,
    status_for,
    color_for,
    success,
    utc_now_iso,
)


ENDPOINT = "https://www.minimaxi.com/v1/token_plan/remains"


def fetch_remains(api_key: str) -> dict[str, Any]:
    request = urllib.request.Request(
        ENDPOINT,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def reset_at_from_remaining_ms(value: Any) -> str | None:
    remaining_ms = numeric(value)
    if remaining_ms <= 0:
        return None
    reset_at = datetime.now(timezone.utc) + timedelta(milliseconds=remaining_ms)
    return reset_at.isoformat().replace("+00:00", "Z")


def item(item_id: str, name: str, used: float, total: float, reset_at: str | None) -> dict[str, Any]:
    return {
        "id": item_id,
        "name": name,
        "used": max(used, 0),
        "limit": max(total, 0),
        "displayStyle": "ratio",
        "resetAt": reset_at,
        "status": status_for(used, total),
        "color": color_for(used, total),
    }


MODEL_SORT_ORDER = {
    "model_text_generation": 0,
    "model_vision": 1,
    "model_search": 2,
    "model_image": 3,
    "model_speech": 4,
    "model_video": 5,
    "model_fast_video": 6,
    "model_music": 7,
    "model_cover_song": 8,
    "model_lyrics": 9,
}

PERIOD_ORDER = {
    "period_5h": 0,
    "period_day": 1,
    "period_week": 2,
    "period_generic": 3,
}


def item_sort_key(entry: dict[str, Any]) -> tuple[int, int]:
    return (
        MODEL_SORT_ORDER.get(entry.get("_sort_model_key"), len(MODEL_SORT_ORDER)),
        PERIOD_ORDER.get(entry.get("_sort_period_key"), 99),
    )


def is_weekly_redundant(model: dict[str, Any], interval_total: float, weekly_total: float) -> bool:
    if interval_total <= 0:
        return False
    interval_ms = numeric(model.get("end_time")) - numeric(model.get("start_time"))
    weekly_ms = numeric(model.get("weekly_end_time")) - numeric(model.get("weekly_start_time"))
    if interval_ms <= 0 or weekly_ms <= 0:
        return False
    return weekly_ms / interval_ms <= weekly_total / interval_total


IMAGE_PLAN_BADGES = {
    50: "Plus",
    120: "Max",
    100: "Plus High",
    200: "Max High",
    800: "Ultra High",
}


def model_display_key(model_name: str) -> str | None:
    if model_name == "MiniMax-M*":
        return "model_text_generation"
    if model_name == "coding-plan-vlm":
        return "model_vision"
    if model_name == "coding-plan-search":
        return "model_search"
    if model_name.startswith("image-"):
        return "model_image"
    if model_name == "speech-hd":
        return "model_speech"
    if model_name.startswith("MiniMax-Hailuo-") and "Fast" in model_name:
        return "model_fast_video"
    if model_name.startswith("MiniMax-Hailuo-"):
        return "model_video"
    if model_name == "music-cover":
        return "model_cover_song"
    if model_name == "lyrics_generation":
        return "model_lyrics"
    if model_name.startswith("music-"):
        return "model_music"
    return None


def interval_label_key(model: dict[str, Any]) -> str:
    time_diff_ms = numeric(model.get("end_time")) - numeric(model.get("start_time"))
    hours_diff = time_diff_ms / 1000 / 3600
    if hours_diff <= 5.1:
        return "period_5h"
    if hours_diff <= 24.1:
        return "period_day"
    if hours_diff <= 168.1:
        return "period_week"
    return "period_generic"


def build_items(payload: dict[str, Any], language: str, translate: Any) -> tuple[list[dict[str, Any]], str | None]:
    models = payload.get("model_remains", [])
    if not isinstance(models, list):
        return [], None

    badge: str | None = None
    output: list[dict[str, Any]] = []
    for model in models:
        if not isinstance(model, dict):
            continue

        raw_name = str(model.get("model_name", "unknown"))
        model_key = model_display_key(raw_name)
        name = translate(language, model_key) if model_key else raw_name
        slug = raw_name.replace(" ", "-").replace("/", "-").lower()

        interval_total = numeric(model.get("current_interval_total_count"))
        interval_used = numeric(model.get("current_interval_usage_count"))
        weekly_total = numeric(model.get("current_weekly_total_count"))
        weekly_used = numeric(model.get("current_weekly_usage_count"))

        if raw_name == "image-01" and badge is None and interval_total > 0:
            if interval_total == int(interval_total):
                badge = IMAGE_PLAN_BADGES.get(int(interval_total))

        if interval_total > 0:
            period_key = interval_label_key(model)
            entry = item(
                f"minimax-{slug}-interval",
                f"{name} ({translate(language, period_key)})",
                interval_used,
                interval_total,
                reset_at_from_remaining_ms(model.get("remains_time")),
            )
            entry["_sort_model_key"] = model_key
            entry["_sort_period_key"] = period_key
            output.append(entry)

        if weekly_total > 0 and not is_weekly_redundant(model, interval_total, weekly_total):
            period_key = "period_week"
            entry = item(
                f"minimax-{slug}-week",
                f"{name} ({translate(language, period_key)})",
                weekly_used,
                weekly_total,
                reset_at_from_remaining_ms(model.get("weekly_remains_time")),
            )
            entry["_sort_model_key"] = model_key
            entry["_sort_period_key"] = period_key
            output.append(entry)

    if badge is None:
        badge = "Starter"

    output.sort(key=item_sort_key)
    for entry in output:
        entry.pop("_sort_model_key", None)
        entry.pop("_sort_period_key", None)
    return output, badge


def main() -> int:
    params = parse_usageboard_params(sys.argv[1:])
    language = app_language(params)
    translate = make_translator({
        "model_text_generation": {"zh-Hans": "文本",       "en": "Text"},
        "model_vision":         {"zh-Hans": "视觉",       "en": "Vision"},
        "model_search":         {"zh-Hans": "搜索",       "en": "Search"},
        "model_image":          {"zh-Hans": "图像",       "en": "Image"},
        "model_speech":         {"zh-Hans": "语音",       "en": "Speech"},
        "model_fast_video":     {"zh-Hans": "快速视频",    "en": "Fast video"},
        "model_video":          {"zh-Hans": "视频",       "en": "Video"},
        "model_cover_song":     {"zh-Hans": "翻唱",       "en": "Cover song"},
        "model_lyrics":         {"zh-Hans": "歌词",       "en": "Lyrics"},
        "model_music":          {"zh-Hans": "音乐",       "en": "Music"},
        "period_5h":            {"zh-Hans": "5小时",      "en": "5 hours"},
        "period_day":           {"zh-Hans": "天",         "en": "day"},
        "period_week":          {"zh-Hans": "周",         "en": "week"},
        "period_generic":       {"zh-Hans": "周期",       "en": "period"},
        "no_quota_items":       {"zh-Hans": "未获取到配额数据", "en": "No quota data found."},
        "invalid_api_key":      {"zh-Hans": "API Key 无效，请检查配置", "en": "Invalid API Key. Check your settings."},
    })

    api_key = params.get("API_KEY")
    if not api_key:
        return failure(translate(language, "missing_api_key"))

    try:
        payload = fetch_remains(api_key)
    except urllib.error.HTTPError as error:
        return handle_http_error(error, translate, language)
    except urllib.error.URLError as error:
        return handle_url_error(error, translate, language)
    except TimeoutError:
        return failure(translate(language, "request_timeout"))
    except json.JSONDecodeError:
        return failure(translate(language, "usage_parse_failed"))
    except Exception:
        return failure(translate(language, "network_error"))

    try:
        status_code = payload.get("base_resp", {}).get("status_code", 0)
        if status_code != 0:
            if status_code == 2049:
                return failure(translate(language, "invalid_api_key"))
            status_msg = payload.get("base_resp", {}).get("status_msg", "")
            return failure(f"{status_msg} ({status_code})" if status_msg else str(status_code))
        items, badge = build_items(payload, language, translate)
    except Exception:
        return failure(translate(language, "usage_parse_failed"))

    if not items:
        return failure(translate(language, "no_quota_items"))
    return success(items, badge=badge)


if __name__ == "__main__":
    sys.exit(main())
