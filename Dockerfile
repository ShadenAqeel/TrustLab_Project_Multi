FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements-web.txt ./
RUN pip install --no-cache-dir -r requirements-web.txt
COPY trustlab_unsupervised/ trustlab_unsupervised/
COPY backend/ backend/
COPY models/ models/
COPY figures/ figures/
COPY web/ web/
EXPOSE 8080
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
