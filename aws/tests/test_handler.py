import io
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import urllib.error

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


def _gemini_response_payload(text, finish_reason="STOP"):
    return {
        "candidates": [{
            "content": {"parts": [{"text": text}]},
            "finishReason": finish_reason,
        }],
        "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 20},
    }


def test_refusal_returns_http_200_without_model_call():
    with patch.dict(os.environ, {"MODEL_PROVIDER": "bedrock"}), patch.object(handler, "call_model") as model:
        response = _response(_event({"action": "generate", "topic": "design a weapon"}))
    assert response["statusCode"] == 200
    assert "refusal" in json.loads(response["body"])
    model.assert_not_called()


def test_gemini_is_default_provider_and_returns_provider_and_spec():
    env = {
        "GEMINI_MODEL": "gemini-2.0-flash",
        "GEMINI_API_KEY": "test-key-123",
    }
    # Do not set MODEL_PROVIDER so it defaults to gemini
    with patch.dict(os.environ, env, clear=True), patch.object(
        handler, "call_model", return_value=(json.dumps(_spec()), {"inputTokens": 5, "outputTokens": 10})
    ):
        response = _response(_event({"action": "generate", "topic": "quadcopter"}))
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["provider"] == "gemini"
    assert "spec" in body
    assert body["repairAttempted"] is False


def test_gemini_model_not_configured_fails_with_clear_reason(capsys):
    env = {"GEMINI_API_KEY": "test-key-123"}
    with patch.dict(os.environ, env, clear=True):
        response = _response(_event({"action": "generate", "topic": "quadcopter"}))
    assert response["statusCode"] == 502
    assert json.loads(response["body"]) == {"error": "generation_failed"}
    captured = capsys.readouterr().out
    assert "gemini_model_not_configured" in captured


def test_gemini_key_sent_in_header_not_in_url():
    env = {
        "GEMINI_MODEL": "gemini-2.0-flash",
        "GEMINI_API_KEY": "secret-gemini-key-xyz",
    }
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(_gemini_response_payload("{\"answer\":\"ok\",\"usedGeneralKnowledge\":false}")).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch.dict(os.environ, env, clear=True), patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        text, usage = handler.call_model("test prompt", "system prompt", "gemini-2.0-flash", 100, 0.4)
        assert mock_urlopen.call_count == 1
        req = mock_urlopen.call_args[0][0]
        # Key must be sent in x-goog-api-key header
        assert req.headers.get("X-goog-api-key") == "secret-gemini-key-xyz"
        # Key must NOT be in URL query string
        assert "secret-gemini-key-xyz" not in req.full_url
        assert "key=" not in req.full_url


def test_gemini_key_absent_from_logs_and_errors(capsys):
    secret_key = "SUPER_SECRET_KEY_NEVER_LOG"
    env = {
        "GEMINI_MODEL": "gemini-2.0-flash",
        "GEMINI_API_KEY": secret_key,
    }
    http_error = urllib.error.HTTPError(
        url="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        code=400,
        msg="Bad Request",
        hdrs={},
        fp=io.BytesIO(b"error details"),
    )
    with patch.dict(os.environ, env, clear=True), patch("urllib.request.urlopen", side_effect=http_error):
        response = _response(_event({"action": "generate", "topic": "quadcopter"}))

    assert response["statusCode"] == 502
    assert secret_key not in response["body"]
    captured = capsys.readouterr().out
    assert secret_key not in captured


def test_gemini_429_retries_once():
    env = {
        "GEMINI_MODEL": "gemini-2.0-flash",
        "GEMINI_API_KEY": "test-key",
    }
    http_429 = urllib.error.HTTPError(
        url="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        code=429,
        msg="Rate limited",
        hdrs={},
        fp=io.BytesIO(b"rate limited"),
    )
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(_gemini_response_payload(json.dumps(_spec()))).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch.dict(os.environ, env, clear=True), \
         patch("urllib.request.urlopen", side_effect=[http_429, mock_resp]) as mock_urlopen, \
         patch("time.sleep") as mock_sleep:
        text, usage = handler.call_model("prompt", "sys", "gemini-2.0-flash", 7000, 0.4)
        assert mock_urlopen.call_count == 2
        mock_sleep.assert_called_once_with(2)


def test_truncated_response_triggers_repair_path():
    env = {
        "GEMINI_MODEL": "gemini-2.0-flash",
        "GEMINI_API_KEY": "test-key",
    }
    first_resp = MagicMock()
    first_resp.read.return_value = json.dumps(_gemini_response_payload("{\"partial\":", finish_reason="MAX_TOKENS")).encode("utf-8")
    first_resp.__enter__.return_value = first_resp

    second_resp = MagicMock()
    second_resp.read.return_value = json.dumps(_gemini_response_payload(json.dumps(_spec()))).encode("utf-8")
    second_resp.__enter__.return_value = second_resp

    with patch.dict(os.environ, env, clear=True), \
         patch("urllib.request.urlopen", side_effect=[first_resp, second_resp]) as mock_urlopen:
        response = _response(_event({"action": "generate", "topic": "safe drone"}))
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["repairAttempted"] is True
    assert mock_urlopen.call_count == 2


def test_empty_response_triggers_repair_path():
    env = {
        "GEMINI_MODEL": "gemini-2.0-flash",
        "GEMINI_API_KEY": "test-key",
    }
    first_resp = MagicMock()
    first_resp.read.return_value = json.dumps(_gemini_response_payload("")).encode("utf-8")
    first_resp.__enter__.return_value = first_resp

    second_resp = MagicMock()
    second_resp.read.return_value = json.dumps(_gemini_response_payload(json.dumps(_spec()))).encode("utf-8")
    second_resp.__enter__.return_value = second_resp

    with patch.dict(os.environ, env, clear=True), \
         patch("urllib.request.urlopen", side_effect=[first_resp, second_resp]) as mock_urlopen:
        response = _response(_event({"action": "generate", "topic": "safe drone"}))
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["repairAttempted"] is True
    assert mock_urlopen.call_count == 2


def test_thinking_config_added_only_when_configured():
    env = {
        "GEMINI_MODEL": "gemini-2.0-flash",
        "GEMINI_API_KEY": "test-key",
        "GEMINI_THINKING_BUDGET": "1024",
    }
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(_gemini_response_payload("{\"answer\":\"ok\",\"usedGeneralKnowledge\":false}")).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch.dict(os.environ, env, clear=True), patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        handler.call_model("prompt", "sys", "gemini-2.0-flash", 100, 0.4)
        req = mock_urlopen.call_args[0][0]
        data = json.loads(req.data.decode("utf-8"))
        assert data["generationConfig"]["thinkingConfig"]["thinkingBudget"] == 1024

    # Now without GEMINI_THINKING_BUDGET
    env_no_thinking = {
        "GEMINI_MODEL": "gemini-2.0-flash",
        "GEMINI_API_KEY": "test-key",
    }
    with patch.dict(os.environ, env_no_thinking, clear=True), patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        handler.call_model("prompt", "sys", "gemini-2.0-flash", 100, 0.4)
        req = mock_urlopen.call_args[0][0]
        data = json.loads(req.data.decode("utf-8"))
        assert "thinkingConfig" not in data["generationConfig"]


def test_bedrock_converse_path():
    env = {
        "MODEL_PROVIDER": "bedrock",
        "BEDROCK_MODEL_ID": "anthropic.claude-3-haiku-20240307-v1:0",
        "BEDROCK_REGION": "us-east-1",
    }
    mock_bedrock = MagicMock()
    mock_bedrock.converse.return_value = {
        "output": {"message": {"content": [{"text": json.dumps(_spec())}]}},
        "usage": {"inputTokens": 10, "outputTokens": 20},
    }
    mock_boto3 = MagicMock()
    mock_boto3.client.return_value = mock_bedrock

    with patch.dict(os.environ, env, clear=True), \
         patch.dict(sys.modules, {"boto3": mock_boto3}):
        response = _response(_event({"action": "generate", "topic": "safe drone"}))

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["provider"] == "bedrock"
    assert "spec" in body
    mock_boto3.client.assert_called_once_with("bedrock-runtime", region_name="us-east-1")
    assert mock_bedrock.converse.call_count == 1


def test_validation_clamps_geometry_and_drops_bad_references():
    result, _ = handler.validate_and_repair_scene_spec(_spec(), "safe drone")
    assert result["components"][0]["parts"][0]["size"][0] == 15
    assert result["components"][0]["parts"][0]["position"][0] == 15
    assert result["connections"] == []


def test_explain_sends_expected_request_and_returns_shape():
    env = {
        "GEMINI_MODEL": "gemini-2.0-flash",
        "GEMINI_API_KEY": "test-key",
    }
    with patch.dict(os.environ, env), patch.object(
        handler, "call_model", return_value=(json.dumps({"answer": "Grounded answer", "usedGeneralKnowledge": False}), {"inputTokens": 3, "outputTokens": 4})
    ) as model:
        response = _response(_event({"action": "explain", "specSummary": {"topic": "drone"}, "componentId": "motor", "question": "What does it do?"}))
    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"answer": "Grounded answer", "usedGeneralKnowledge": False, "provider": "gemini"}
    assert '"componentId":"motor"' in model.call_args.args[0]


def test_options_returns_cors_headers():
    response = _response(_event({}, "OPTIONS"))
    assert response["statusCode"] == 200
    assert response["headers"]["Access-Control-Allow-Methods"] == "POST, OPTIONS"
    assert response["headers"]["Access-Control-Allow-Origin"] == "*"


def test_quoted_env_vars_are_stripped():
    env = {
        "MODEL_PROVIDER": ' "gemini" ',
        "GEMINI_MODEL": ' "gemini-2.0-flash" ',
        "GEMINI_API_KEY": " 'secret-key-quoted' ",
        "ALLOWED_ORIGIN": ' "https://example.com" ',
    }
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(_gemini_response_payload(json.dumps(_spec()))).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch.dict(os.environ, env, clear=True), patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        response = _response(_event({"action": "generate", "topic": "safe drone"}))

    assert response["statusCode"] == 200
    assert response["headers"]["Access-Control-Allow-Origin"] == "https://example.com"
    req = mock_urlopen.call_args[0][0]
    assert req.headers.get("X-goog-api-key") == "secret-key-quoted"
    assert "/models/gemini-2.0-flash:" in req.full_url

