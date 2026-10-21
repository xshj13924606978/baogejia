# ============================================================
# OCR Service: FastAPI + RapidOCR (ONNX Runtime)
# 中文 OCR 识别服务，供 quote-system 内网调用
# ============================================================

FROM python:3.10-slim

WORKDIR /app

# 安装系统依赖（RapidOCR/OpenCV 运行所需）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY . .

# 预下载模型（构建时下载，避免运行时网络波动）
# rapidocr-onnxruntime 首次初始化会自动下载 PP-OCRv4 中文模型
RUN python -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR()"

# 暴露端口
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)" || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
