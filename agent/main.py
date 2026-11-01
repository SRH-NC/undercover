"""The UnderCover Agent, which decides claims through the backend's API."""

import json
import os
from collections.abc import Iterator
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import BaseTool, tool
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

load_dotenv(override=True)

BACKEND_URL = "http://localhost:8000"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-6-luna"


def backend() -> httpx.Client:
    """Return a client for the UnderCover backend."""
    return httpx.Client(base_url=BACKEND_URL, timeout=30)


def request(
    method: str, path: str, body: dict[str, Any] | None = None
) -> httpx.Response:
    """Send one request to the backend."""
    with backend() as client:
        return client.request(method, path, json=body)


def model() -> ChatOpenAI:
    """Return the model named in MODEL_NAME, or GPT-6 Luna by default."""
    name = os.getenv("MODEL_NAME")
    return ChatOpenAI(
        model=name or DEFAULT_MODEL,
        base_url=OPENROUTER_BASE_URL,
        api_key=SecretStr(os.environ["OPENROUTER_API_KEY"]),
        reasoning_effort=None if name else "low",
    )


def tools_for(claim: dict[str, Any]) -> list[BaseTool]:
    """Make the agent's tools, which work only on this claim."""
    claim_id = claim["claim_id"]

    @tool
    def get_claim() -> str:
        """Read the claim: the customer's story, the items claimed and the documents."""
        return request("GET", f"/api/claims/{claim_id}").text

    @tool
    def get_policy() -> str:
        """Read the customer's policy: the plan, add-ons, trip and travelers."""
        return request("GET", f"/api/policies/{claim['policy_id']}").text

    @tool
    def get_claim_history() -> str:
        """Read the customer's earlier claims."""
        path = f"/api/customers/{claim['customer_id']}/claim-history"
        return request("GET", path).text

    @tool
    def get_policy_wording() -> str:
        """Read the policy wording, which every decision follows."""
        return request("GET", "/api/policy-wording").text

    @tool(parse_docstring=True)
    def decide_claim(
        decision: Literal["approve", "decline", "refer"],
        payout: float,
        reason: str,
        policy_section: str,
    ) -> str:
        """Record the decision on the claim.

        Args:
            decision: approve, decline or refer.
            payout: The payout in US dollars, or 0 unless you approve.
            reason: Two or three plain sentences explaining the decision.
            policy_section: The section it rests on, such as "Section 3, Trip Delay".
        """
        body = {
            "decision": decision,
            "payout": payout,
            "reason": reason,
            "policy_section": policy_section,
        }
        return request("POST", f"/api/claims/{claim_id}/decision", body).text

    @tool
    def pay_claim(amount: float) -> str:
        """Pay the approved payout on the claim, in US dollars."""
        path = f"/api/claims/{claim_id}/payment"
        return request("POST", path, {"amount": amount}).text

    return [
        get_claim,
        get_policy,
        get_claim_history,
        get_policy_wording,
        decide_claim,
        pay_claim,
    ]


def steps_in(update: dict[str, Any]) -> Iterator[tuple[str, str, str]]:
    """Turn one update from the agent's stream into steps: kind, name, content."""
    for node in update.values():
        for message in node.get("messages", []):
            if isinstance(message, AIMessage):
                if message.text:
                    yield "message", "agent", message.text
                for call in message.tool_calls:
                    yield "tool_call", call["name"], json.dumps(call["args"])
            elif isinstance(message, ToolMessage):
                yield "tool_result", message.name or "", message.text


def run(claim_id: str, thread_id: str, llm: BaseChatModel | None = None) -> str:
    """Work one claim, record each step, and return the agent's final reply."""
    started = request("POST", f"/api/claims/{claim_id}/start", {"thread_id": thread_id})
    started.raise_for_status()
    instructions = request("GET", "/api/instructions").json()["content"]
    agent = create_agent(
        llm or model(), tools=tools_for(started.json()), system_prompt=instructions
    )
    reply = ""
    for update in agent.stream(
        {"messages": [{"role": "user", "content": f"Please decide claim {claim_id}."}]},
        config={"configurable": {"thread_id": thread_id}},
        stream_mode="updates",
    ):
        for kind, name, content in steps_in(update):
            step = {"thread_id": thread_id, "kind": kind, "name": name}
            request(
                "POST", f"/api/claims/{claim_id}/steps", step | {"content": content}
            )
            if kind == "message":
                reply = content
    return reply
