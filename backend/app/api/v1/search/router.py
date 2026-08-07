from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.core.elasticsearch import get_elasticsearch, ELASTICSEARCH_INDEXES
from app.schemas.common import SearchRequest, SearchResponse

router = APIRouter(prefix="/api/v1/search", tags=["Search"])

TIME_RANGE_MAP = {
    "15m": 0.25,
    "30m": 0.5,
    "1h": 1,
    "2h": 2,
    "4h": 4,
    "6h": 6,
    "12h": 12,
    "24h": 24,
    "48h": 48,
    "7d": 168,
    "14d": 336,
    "30d": 720,
    "90d": 2160,
}


def _parse_time_range(time_range: str) -> datetime.datetime:
    hours = TIME_RANGE_MAP.get(time_range, 24)
    return datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)


@router.post("", response_model=SearchResponse)
@router.post("/", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    current_user=Depends(get_current_user),
):
    es = await get_elasticsearch()

    if body.index:
        index = body.index
    else:
        index = ",".join(ELASTICSEARCH_INDEXES)

    es_query = {
        "bool": {
            "must": [
                {"query_string": {"query": body.query}}
            ],
            "filter": [
                {
                    "range": {
                        "@timestamp": {
                            "gte": _parse_time_range(body.time_range).isoformat()
                        }
                    }
                }
            ],
        }
    }

    try:
        response = await es.search(
            index=index,
            body={
                "query": es_query,
                "from": body.from_,
                "size": body.size,
                "sort": [
                    {body.sort_field or "@timestamp": {"order": body.sort_order}}
                ]
                if body.sort_field or True
                else None,
                "aggs": {
                    "severity_breakdown": {
                        "terms": {"field": "severity"}
                    }
                },
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Elasticsearch query failed: {str(e)}",
        )

    took_ms = response.get("took", 0)
    hits = response.get("hits", {})
    total = hits.get("total", {})
    total_value = total if isinstance(total, int) else total.get("value", 0)
    results = [hit["_source"] for hit in hits.get("hits", [])]
    aggregations = response.get("aggregations")

    return SearchResponse(
        total=total_value,
        took_ms=float(took_ms),
        results=results,
        aggregations=aggregations,
    )


@router.get("/saved")
async def list_saved_searches(
    current_user=Depends(get_current_user),
):
    return {"items": [], "total": 0}


@router.post("/saved", status_code=status.HTTP_201_CREATED)
async def save_search(
    body: SearchRequest,
    current_user=Depends(get_current_user),
):
    return {"message": "Search saved (placeholder)", "query": body.query}
