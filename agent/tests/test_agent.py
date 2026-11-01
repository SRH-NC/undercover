import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from agent import main

READS = ["get_claim", "get_policy", "get_claim_history", "get_policy_wording"]


class StubModel(GenericFakeChatModel):
    """A chat model that gives scripted replies in place of a real model."""

    def bind_tools(self, tools, **kwargs):
        return self


def calls(*tools, content=""):
    """A scripted model turn that calls the given tools, as (name, args) pairs."""
    return AIMessage(
        content=content,
        tool_calls=[
            {"name": name, "args": args, "id": f"call-{name}"} for name, args in tools
        ],
    )


def decision(decision, payout):
    return (
        "decide_claim",
        {
            "decision": decision,
            "payout": payout,
            "reason": "The delay is covered. The receipts support the costs.",
            "policy_section": "Section 3, Trip Delay",
        },
    )


def stub(*replies):
    return StubModel(messages=iter(replies))


def test_run_reads_decides_pays_and_records_each_step(api):
    reply = main.run(
        "CLM-1001",
        "thread-1",
        stub(
            calls(*[(name, {}) for name in READS]),
            calls(decision("approve", 420), content="The delay is covered."),
            calls(("pay_claim", {"amount": 420})),
            AIMessage(content="Approved CLM-1001 for $420.00 and paid it."),
        ),
    )
    assert reply == "Approved CLM-1001 for $420.00 and paid it."
    claim = api.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["thread_id"] == "thread-1"
    assert claim["decision"]["payout"] == 420
    assert claim["payment"]["amount"] == 420

    steps = api.get("/api/claims/CLM-1001/steps").json()
    assert {step["thread_id"] for step in steps} == {"thread-1"}
    tool_calls = [step["name"] for step in steps if step["kind"] == "tool_call"]
    assert tool_calls == [*READS, "decide_claim", "pay_claim"]
    results = {step["name"]: step for step in steps if step["kind"] == "tool_result"}
    assert '"policy_id":"POL-2001"' in results["get_policy"]["content"]
    assert "Policy Wording" in results["get_policy_wording"]["content"]
    messages = [step["content"] for step in steps if step["kind"] == "message"]
    assert messages == ["The delay is covered.", reply]


def test_the_backend_refuses_the_agent_a_payout_over_the_limit(api):
    main.run(
        "CLM-1001",
        "thread-1",
        stub(
            calls(decision("approve", 1200)),
            calls(("pay_claim", {"amount": 1200})),
            AIMessage(content="Approved for $1,200.00, waiting for sign-off."),
        ),
    )
    claim = api.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "awaiting_sign_off"
    assert claim["payment"] is None
    steps = api.get("/api/claims/CLM-1001/steps").json()
    refusal = [step for step in steps if step["name"] == "pay_claim"][-1]
    assert refusal["kind"] == "tool_result"
    assert "needs a handler's sign-off" in refusal["content"]


def test_the_tools_take_no_ids_and_act_only_on_their_claim(api):
    claim = api.post("/api/claims/CLM-1001/start", json={"thread_id": "t"}).json()
    api.post("/api/claims/CLM-1002/start", json={"thread_id": "t"})
    tools = {tool.name: tool for tool in main.tools_for(claim)}
    for name in READS:
        assert tools[name].args == {}
    assert set(tools["decide_claim"].args) == {
        "decision",
        "payout",
        "reason",
        "policy_section",
    }
    assert set(tools["pay_claim"].args) == {"amount"}

    tools["decide_claim"].invoke(decision("decline", 0)[1])
    assert api.get("/api/claims/CLM-1001").json()["status"] == "decided"
    assert api.get("/api/claims/CLM-1002").json()["status"] == "in_progress"


def test_the_system_prompt_is_the_instructions_from_the_api(api, monkeypatch):
    prompts = []
    real = main.create_agent

    def spy(*args, **kwargs):
        prompts.append(kwargs["system_prompt"])
        return real(*args, **kwargs)

    monkeypatch.setattr(main, "create_agent", spy)
    main.run("CLM-1001", "thread-1", stub(AIMessage(content="Done.")))
    assert prompts == [api.get("/api/instructions").json()["content"]]
    assert prompts[0].startswith("# The UnderCover Agent")


def test_run_refuses_a_claim_that_has_a_decision(api):
    api.post("/api/claims/CLM-1001/start", json={"thread_id": "t"})
    api.post("/api/claims/CLM-1001/decision", json=decision("decline", 0)[1])
    with pytest.raises(Exception, match="409 Conflict"):
        main.run("CLM-1001", "thread-2", stub(AIMessage(content="Done.")))


def test_model_name(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("MODEL_NAME", raising=False)
    assert main.model().model_name == "openai/gpt-6-luna"
    assert main.model().reasoning_effort == "low"
    monkeypatch.setenv("MODEL_NAME", "openrouter/free")
    assert main.model().model_name == "openrouter/free"
