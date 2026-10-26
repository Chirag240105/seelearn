FROM python:3.11.9-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY eval/requirements.txt /workspace/eval/requirements.txt
RUN python -m pip install --no-cache-dir -r eval/requirements.txt
COPY . /workspace
ENTRYPOINT ["python", "eval/evaluate.py"]
