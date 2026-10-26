# Function URL smoke requests

Replace `FUNCTION_URL` with the Function URL printed by the deployment script.

```sh
curl -X POST "$FUNCTION_URL" -H "content-type: application/json" \
  -d '{"action":"generate","topic":"racing drone power and flight control"}'
```

```sh
curl -X POST "$FUNCTION_URL" -H "content-type: application/json" \
  -d '{"action":"explain","specSummary":{"topic":"racing drone","component":{"id":"flight_controller","summary":"Coordinates flight control.","howItWorks":"An IMU and processor calculate motor commands."}},"componentId":"flight_controller","question":"How does this component work?"}'
```
