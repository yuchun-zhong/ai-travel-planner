"""联网搜索工具 - 为旅行规划师提供实时信息检索能力"""

from coze_coding_dev_sdk import SearchClient
from coze_coding_utils.log.write_log import request_context
from coze_coding_utils.runtime_ctx.context import new_context
from langchain.tools import tool


@tool
def search_travel_info(query: str) -> str:
    """搜索目的地的实时旅行信息，包括景点、美食、交通、天气、住宿等。
    当需要了解目的地的最新情况（如景点开放时间、门票价格、当地美食推荐、交通方式、天气状况等）时使用此工具。

    Args:
        query: 搜索关键词，应包含目的地和具体需求，如"京都必去景点推荐"、"曼谷美食攻略"、"清迈交通指南"
    """
    ctx = request_context.get() or new_context(method="search_travel_info")
    client = SearchClient(ctx=ctx)

    try:
        response = client.web_search_with_summary(
            query=query,
            count=8
        )

        results = []

        # 添加AI摘要
        if response.summary:
            results.append(f"【摘要】{response.summary}")

        # 添加搜索结果
        if response.web_items:
            for i, item in enumerate(response.web_items[:6], 1):
                title = item.title or "无标题"
                snippet = item.snippet or ""
                url = item.url or ""
                results.append(f"{i}. {title}\n   {snippet}\n   来源: {url}")

        if not results:
            return f"未找到关于「{query}」的相关信息，请尝试换个关键词。"

        return "\n\n".join(results)

    except Exception as e:
        return f"搜索「{query}」时出错: {str(e)}，请尝试换个关键词或稍后重试。"
