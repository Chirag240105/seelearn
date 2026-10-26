import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambdas"))
import handler


def _spec():
    components = []
    for index in range(8):
        components.append({
            "id": f"part_{index}", "name": f"Part {index}", "group": "Core",
            "parts": [{"shape": "box", "size": [99, 1, 1], "position": [99, 0, 0], "material": "carbon_fiber"}],
            "summary": "A component.", "howItWorks": "It works.", "whyNeeded": "It is needed.", "confidence": "medium",
        })
    return {"schemaVersion": 1, "title": "Test", "overview": "Test scene", "layoutStyle": "assembly",
            "learningObjectives": ["Learn structure", "Trace power", "Explore operation"], "components": components,
            "connections": [{"from": "part_0", "to": "missing", "type": "power"}]}


def _event(body, method="POST"):
    return {"requestContext": {"http": {"method": method}}, "body": json.dumps(body)}


def _response(event):
    return handler.lambda_handler(event, None)


def test_refusal_returns_http_200_without_model_call():
    with patch.dict(os.environ, {"MODEL_PROVIDER": "bedrock"}), patch.object(handler, "call_model") as model:
        response = _response(_event({"action": "generate", "topic": "design a weapon"}))
    assert response["statusCode"] == 200
    assert "refusal" in json.loads(response["body"])
    model.assert_not_called()


def test_malformed_output_gets_one_repair_call():
    outputs = iter(["not json", json.dumps(_spec())])
    with patch.dict(os.environ, {"MODEL_PROVIDER": "gemini"}), patch.object(
        handler, "call_model", side_effect=lambda *args: (next(outputs), {"inputTokens": 1, "outputTokens": 1})
    ) as model:
        response = _response(_event({"action": "generate", "topic": "safe drone"}))
    assert response["statusCode"] == 200
    assert model.call_count == 2


def test_validation_clamps_geometry_and_drops_bad_references():
    result, _ = handler.validate_and_repair_scene_spec(_spec(), "safe drone")
    assert result["components"][0]["parts"][0]["size"][0] == 15
    assert result["components"][0]["parts"][0]["position"][0] == 15
    assert result["connections"] == []


def test_explain_sends_expected_request_and_returns_shape():
    with patch.dict(os.environ, {"MODEL_PROVIDER": "gemini"}), patch.object(
        handler, "call_model", return_value=(json.dumps({"answer": "Grounded answer", "usedGeneralKnowledge": False}), {"inputTokens": 3, "outputTokens": 4})
    ) as model:
        response = _response(_event({"action": "explain", "specSummary": {"topic": "drone"}, "componentId": "motor", "question": "What does it do?"}))
    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"answer": "Grounded answer", "usedGeneralKnowledge": False}
    assert '"componentId":"motor"' in model.call_args.args[0]


def test_options_returns_cors_headers():
    response = _response(_event({}, "OPTIONS"))
    assert response["statusCode"] == 200
    assert response["headers"]["Access-Control-Allow-Methods"] == "POST, OPTIONS"
    assert response["headers"]["Access-Control-Allow-Origin"] == "*"
