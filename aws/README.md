# SeeLearn AWS backend

The backend is a single Python 3.12 AWS Lambda function behind a Function URL. It validates client requests, calls the configured model provider (Gemini by default; Amazon Bedrock when `MODEL_PROVIDER=bedrock`), validates and repairs scene JSON, and logs structured metrics to CloudWatch.

---

## Route A: AWS Management Console

1. **Create or select the function**:
   - Go to AWS Lambda console in region `us-east-1`.
   - Function name: `seeLearn`
   - Runtime: `Python 3.12`
   - Architecture: `x86_64` (or `arm64`)

2. **Paste function code**:
   - In the **Code** tab, replace `lambda_function.py` with the full content of `aws/lambdas/handler.py`.
   - Click **Deploy**.

3. **Configure General settings**:
   - Navigate to **Configuration** > **General configuration** > **Edit**.
   - Memory: `512 MB`
   - Timeout: `2 min 30 sec` (150 seconds).
   - Click **Save**.

4. **Set Environment variables**:
   - Navigate to **Configuration** > **Environment variables** > **Edit**.
   - Add each Key and Value in separate boxes with no quotes and no leading/trailing spaces:
     - `MODEL_PROVIDER`: `gemini`
     - `GEMINI_MODEL`: e.g. `gemini-2.0-flash`
     - `GEMINI_API_KEY`: your Google AI Studio Gemini API key
     - `ALLOWED_ORIGIN`: `*` (or your frontend origin)
   - Click **Save**.

5. **Create Function URL**:
   - Navigate to **Configuration** > **Function URL** > **Create function URL**.
   - Auth type: `NONE`.
   - Configure CORS in the console: **OFF** (the Lambda handler handles CORS headers directly).
   - Click **Save** and copy the generated Function URL.

6. **Test in Console**:
   - Open the **Test** tab.
   - Event JSON:
     ```json
     {
       "requestContext": { "http": { "method": "POST" } },
       "body": "{\"action\":\"generate\",\"topic\":\"electric motor\"}"
     }
     ```
   - Click **Test** and confirm HTTP 200 with a valid `spec` and `provider`.

---

## Route B: PowerShell Scripts

1. **Prepare configuration**:
   - Copy `aws/.env.example` to `aws/.env`:
     ```powershell
     Copy-Item aws/.env.example aws/.env
     ```
   - Fill in your variable values in `aws/.env`:
     - `MODEL_PROVIDER`
     - `GEMINI_MODEL`
     - `GEMINI_API_KEY`
     - `ALLOWED_ORIGIN`

2. **Deploy code**:
   ```powershell
   .\aws\scripts\deploy_code.ps1 -FunctionName seeLearn -Region us-east-1
   ```

3. **Set Lambda environment**:
   ```powershell
   .\aws\scripts\set_lambda_env.ps1 -FunctionName seeLearn -Region us-east-1 -EnvFile aws/.env
   ```

4. **Verify Function URL**:
   ```powershell
   .\aws\scripts\test_function_url.ps1 -Url "<YOUR_FUNCTION_URL>"
   ```

---

## Environment Variable Reference

| Variable Name | Required | Default | Description |
|---|---|---|---|
| `MODEL_PROVIDER` | No | `gemini` | Model provider: `gemini` or `bedrock`. |
| `GEMINI_MODEL` | Yes (for Gemini) | None | Gemini model ID (e.g. `gemini-2.0-flash`). |
| `GEMINI_API_KEY` | Yes (for Gemini) | None | Google AI Studio API key. |
| `ALLOWED_ORIGIN` | No | `*` | Allowed CORS origin for responses. |
| `GEMINI_MAX_OUTPUT_TOKENS` | No | `8192` | Maximum generation tokens. |
| `GEMINI_THINKING_BUDGET` | No | None | Thinking budget for supported models. |
| `BEDROCK_MODEL_ID` | Yes (for Bedrock) | None | Bedrock model identifier. |
| `BEDROCK_REGION` | No | `us-east-1` | AWS region for Amazon Bedrock runtime. |
| `EXPLAIN_MODEL_ID` | No | None | Optional Bedrock model for explain actions. |

---

## Troubleshooting

| Symptom / Error | Root Cause | Resolution |
|---|---|---|
| `"Hello from Lambda"` | Default starter code is still in the function | Run `deploy_code.ps1` or paste `aws/lambdas/handler.py` into `lambda_function.py` and click **Deploy**. |
| `generation_failed` | Internal model or validation error | Open AWS CloudWatch logs for `/aws/lambda/seeLearn` and inspect the structured log line `reason` field. |
| `gemini_http_404` | Invalid or retired model name | Check `GEMINI_MODEL`. Verify the model name in Google AI Studio documentation (e.g. `gemini-2.0-flash`). |
| `gemini_http_401` / `403` | Missing or invalid API key | Verify `GEMINI_API_KEY` in environment variables with no extra quotes or whitespace. |
| `gemini_http_429` | Rate limit exceeded | Wait and retry, or configure a paid tier quota in Google AI Studio. |
| Function timeout | Cold start or generation took > 150 s | Ensure General configuration timeout is set to 2 min 30 sec (150 seconds) and memory is at least 512 MB. |
