# Devpost Submission

## Inspiration

We wanted engineering learners to inspect assemblies spatially and interactively rather than relying only on static diagrams.

## What it does

SeeLearn displays conceptual engineering assemblies in a browser-based 3D scene. Users can open bundled samples, optionally request a generated scene from the deployed backend, and explore with mouse controls or a local hand-tracking service.

## How we built it

The interface uses React and Three.js. MediaPipe provides hand landmarks to a Python service; OpenCV captures and preprocesses frames, smooths cursor movement, and derives gesture state. An optional Lambda Function URL invokes Bedrock for scene generation and explanations. Evaluation scripts process recordings and deployed endpoint responses.

## Challenges

The project combines camera permissions, real-time tracking, browser interaction, structured scene validation, and optional cloud inference. Lighting and tracking loss affect gesture input; network and model availability affect new-topic generation.

## Accomplishments

The browser includes bundled scenes for offline demonstrations. Demo Mode routes prompt submissions to those samples. The local vision service keeps camera processing on the machine and communicates cursor and gesture state to the browser.

## What we learned

We learned to separate landmark detection from image and interaction processing, validate model output before rendering, and distinguish measured evaluation results from claims that need actual recordings.

## What's next

Collect authorized labeled recordings, run the evaluation pipeline, improve usability from measured failure cases, and continue validating scene details with engineering references.

## Built with

React, Three.js, Python, OpenCV, MediaPipe, AWS Lambda, Amazon Bedrock, CloudWatch, Docker, and matplotlib.
