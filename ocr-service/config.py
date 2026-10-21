# ============================================================
# OCR Service 配置
# ============================================================
import os

# RapidOCR 识别参数
OCR_USE_GPU = os.environ.get("OCR_USE_GPU", "false").lower() == "true"

# 图片预处理参数
PREPROCESS_ENABLED = os.environ.get("OCR_PREPROCESS", "true").lower() == "true"
MIN_WIDTH_FOR_UPSCALE = int(os.environ.get("OCR_MIN_WIDTH", "1200"))
UPSCALE_FACTOR = 2.0
CONTRAST_FACTOR = float(os.environ.get("OCR_CONTRAST", "1.5"))
SHARPNESS_FACTOR = float(os.environ.get("OCR_SHARPNESS", "2.0"))

# 行分组阈值（像素）
LINE_Y_THRESHOLD = int(os.environ.get("OCR_LINE_THRESHOLD", "15"))

# 服务
SERVICE_HOST = os.environ.get("OCR_SERVICE_HOST", "0.0.0.0")
SERVICE_PORT = int(os.environ.get("OCR_SERVICE_PORT", "8000"))
