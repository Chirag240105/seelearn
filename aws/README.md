# SeeLearn AWS backend

The backend is one Python 3.12 Lambda Function URL. It supports scene generation and grounded explanations through the JSON `action` field.

## Requirements

- AWS CLI configured for the deployment account and region
- AWS SAM CLI
- An enabled Amazon Bedrock model in the deployment region, or a Gemini API key
- Node frontend configured with the resulting Function URL

For Bedrock, open the Amazon Bedrock console in the selected region, visit **Model access**, and request or enable access to the model whose ID you deploy. The deploying identity needs permission to create/update CloudFormation and Lambda resources and pass the Lambda execution role.

## Deploy

From this directory, set `BEDROCK_MODEL_ID` to an enabled model ID, then run:

```sh
./deploy.sh
```

On Windows PowerShell:

```powershell
$env:BEDROCK_MODEL_ID = "your-enabled-bedrock-model-id"
.\deploy.ps1
```

Both scripts build with SAM, guide the first deployment, and print the Function URL. Paste it into the frontend `.env` as `VITE_AWS_API_ENDPOINT`, without a path suffix. For Gemini, set `MODEL_PROVIDER=gemini` and `GEMINI_API_KEY` before running the deploy script. Restrict `AllowedOrigin` to the deployed frontend origin for production use.

## Smoke test

```sh
curl -X POST "FUNCTION_URL" -H "content-type: application/json" -d '{"action":"generate","topic":"racing drone power and flight control"}'
```

See [tests/curl_examples.md](tests/curl_examples.md) for both action payloads. The Function URL allows POST and OPTIONS. Generation has a 90-second browser timeout and the Lambda has a 120-second timeout.

Run backend unit tests from the repository root with `python -m pytest aws/tests`.
