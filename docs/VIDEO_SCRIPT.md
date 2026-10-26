# Video Script

## 0:00–0:30 — Hook

Show the prompt screen and introduce SeeLearn as a way to inspect conceptual engineering assemblies in an interactive 3D view.

## 0:30–0:55 — The team

Introduce the team and briefly describe the engineering, interface, vision, and backend work each person contributed. Use the team’s actual names and roles.

## 0:55–1:45 — Live demo with an unseen topic

With Demo Mode off and a deployed backend configured, submit a topic not bundled as a sample. Show the actual loading and result. If the endpoint is not available, use Demo Mode and clearly identify the sample being opened instead of claiming it is generated live.

## 1:45–2:30 — Gesture demo

Start the local Python vision service and demonstrate pointing and pinch selection in the scene. Show mouse control as a fallback. State that the camera image is processed locally and the browser receives cursor and gesture state.

## 2:30–3:05 — Architecture

Walk through the README Mermaid diagram: browser, local OpenCV and MediaPipe service, Lambda Function URL, Bedrock, CloudWatch, and evaluation job. Clarify that MediaPipe provides landmarks and OpenCV performs capture, preprocessing, filtering, gesture logic, and metrics.

## 3:05–3:55 — Evaluation results and failure cases

Open the actual `eval/results/vision_report.md` and chart. Read only values present in that run. If results are unavailable, say evaluation has not yet been run. Mention measured failures from the supplied labels, including tracking loss and any failed endpoint requests; do not invent causes or success rates.

## 3:55–4:35 — AWS proof

Show the deployed Function URL configuration, a real generation response, and corresponding CloudWatch logs. Hide credentials and account identifiers. If deployment is not available, describe the checked-in deployment path without implying it is live.

## 4:35–5:00 — Close

Reiterate that SeeLearn is a conceptual learning viewer, invite viewers to try a bundled sample, and remind them to independently verify engineering details before real-world use.
