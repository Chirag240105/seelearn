# Technical Report

## Problem and users

SeeLearn provides students, educators, and demonstrators with an interactive way to inspect conceptual engineering assemblies. The models support exploration and explanation; they are not validated design artifacts.

## Architecture

The React and Three.js browser displays bundled or backend-generated specifications. A local Python service uses MediaPipe landmarks and OpenCV processing to send gesture and cursor state over a local WebSocket. An optional Lambda Function URL calls Bedrock for generation and explanation. An evaluation job processes real vision recordings and can call the deployed generation endpoint.

## OpenCV implementation

OpenCV owns camera capture, mirrored/resized frames, optional LAB luminance CLAHE, Kalman cursor smoothing, gesture state logic, and runtime metrics. MediaPipe supplies the hand landmarks consumed by that logic. The evaluator can replay recorded cursor coordinates for filter comparisons and process supplied videos for image preprocessing comparisons.

## AWS deployment

The `aws/` SAM application deploys a Lambda Function URL integration with Bedrock. Consult `aws/README.md` for the actual deployment configuration and model access requirements. Lambda operational output is available through CloudWatch. Generation evaluation requires a deployed endpoint URL.

## Evaluation

No evaluation result is included here. Populate the tables from the actual run artifacts listed below; do not copy placeholder values as findings.

Vision results — paste measured rows from `eval/results/vision_report.md` and attach `eval/results/vision_ablation.png`:

| Source and configuration | Frames | Jitter (px) | Accuracy | Loss events | Latency statistics |
|---|---|---|---|---|---|
| RESULTS GO HERE | RESULTS GO HERE | RESULTS GO HERE | RESULTS GO HERE | RESULTS GO HERE | RESULTS GO HERE |

Generation results — paste actual endpoint outcomes and request latencies from `eval/results/generation_report.md` and `eval/results/generation.csv`:

| Topic | Outcome | Latency |
|---|---|---|
| RESULTS GO HERE | RESULTS GO HERE | RESULTS GO HERE |

The source files are `eval/results/vision_ablation.csv`, `eval/results/vision_report.md`, `eval/results/vision_ablation.png`, `eval/results/generation.csv`, and `eval/results/generation_report.md`.

## Failure cases and limitations

Camera permission denial, a camera in use by another program, poor lighting, and hand tracking loss can prevent gesture interaction. Mouse interaction is available. Endpoint timeout, refusal, invalid generation, or unavailable model access can prevent new-topic generation; bundled samples remain available. Evaluation metrics describe the supplied clips and endpoint responses only.

## Responsible use

Models are AI-generated or bundled conceptual visuals and require independent verification for real-world use. Do not use them as safety-critical instructions. The backend has a limited harmful-topic refusal filter. Webcam frames are processed locally and are not uploaded by the vision service. Evaluation recordings are user-managed data; upload them only when authorized.
