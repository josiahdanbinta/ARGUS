from __future__ import annotations

from elasticsearch import AsyncElasticsearch

from app.core.config import get_settings

settings = get_settings()

es_client: AsyncElasticsearch | None = None


async def get_elasticsearch() -> AsyncElasticsearch:
    global es_client
    if es_client is None:
        es_client = AsyncElasticsearch(
            hosts=[settings.ELASTICSEARCH_URL],
            verify_certs=False,
        )
    return es_client


async def close_elasticsearch() -> None:
    global es_client
    if es_client:
        await es_client.close()
        es_client = None


ELASTICSEARCH_INDEXES = [
    "logs",
    "alerts",
    "events",
    "processes",
    "network",
    "dns",
    "firewall",
    "authentication",
    "email",
    "cloud",
    "threatintel",
    "vulnerability",
    "registry",
    "incidents",
]


async def init_elasticsearch() -> None:
    es = await get_elasticsearch()
    for index in ELASTICSEARCH_INDEXES:
        if not await es.indices.exists(index=index):
            await es.indices.create(
                index=index,
                body={
                    "settings": {
                        "number_of_shards": 1,
                        "number_of_replicas": 0,
                    }
                },
            )
