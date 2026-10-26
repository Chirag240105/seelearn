# Evaluation recording protocol

Record six to eight clips, each ten to twenty seconds long, covering these labeled cases: `still hand`, `slow move`, `fast move`, `pinch`, `open palm`, `hand leaving the frame`, and `low light`. Use one label per clip and include at least one repeated case if making six or eight clips. Keep the hand and camera framing visible where the case requires tracking. Low-light recordings should be captured under the intended low-light condition.

Save JSON recordings in `eval/clips/`, for example:

```powershell
python vision_service/seelearn_vision.py --record eval/clips/still_01.json --label "still hand"
```

Stop the service after the clip is complete. The recorder writes per-frame observations as it runs. Preserve original files. For image-based CLAHE ablation, also record matching video files with the same base name (for example `still_01.mp4`) using a local camera recorder. Supply those videos with `--video`; the JSON alone does not contain frames and cannot be reprocessed with CLAHE. Webcam video remains local unless you deliberately copy the recording elsewhere.

Run from the repository root:

```powershell
python -m pip install -r eval/requirements.txt
python eval/evaluate.py
```

The evaluator reads JSON from `eval/clips/` by default and writes measured CSV, Markdown, and PNG artifacts to `eval/results/`. To evaluate videos:

```powershell
python eval/evaluate.py --video eval/clips/still_01.mp4 --label "still hand"
```

Missing measurements are reported as unavailable. Cursor JSON can measure recorded gesture labels, tracking losses, latency, and filter replay. It cannot measure a new CLAHE result without source frames.
