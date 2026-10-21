# ============================================================
# OCR Service
# FastAPI + RapidOCR (ONNX Runtime)
# 提供中文 OCR 识别能力，支持表格行分组与几何表格重建
#
# 接口：
#   GET  /health   健康检查
#   POST /extract  图片识别，返回结构化 JSON（含 table 几何表格）
# ============================================================
import base64
import io
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, ImageEnhance, ImageOps

import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ocr-service")

app = FastAPI(title="OCR Service", version="1.1.0")

# 延迟初始化 OCR 引擎（避免 import 阶段下载模型阻塞启动）
_ocr_engine = None


def get_ocr_engine():
    """惰性加载 RapidOCR 引擎（首次调用时初始化并预下载模型）"""
    global _ocr_engine
    if _ocr_engine is None:
        from rapidocr_onnxruntime import RapidOCR

        logger.info("正在初始化 RapidOCR 引擎...")
        _ocr_engine = RapidOCR()
        logger.info("RapidOCR 引擎初始化完成")
    return _ocr_engine


# ------------------------------------------------------------
# 图片预处理
# ------------------------------------------------------------
def preprocess_image(image: Image.Image) -> Image.Image:
    """预处理：灰度化、放大、增强对比度与锐化，提升中文识别率"""
    # 1. 灰度化
    if image.mode != "L":
        image = image.convert("L")

    # 2. 自动旋转（EXIF 方向）
    image = ImageOps.exif_transpose(image)

    # 3. 小图放大（提高小字号识别率）
    width, height = image.size
    if config.PREPROCESS_ENABLED and width < config.MIN_WIDTH_FOR_UPSCALE:
        new_width = int(width * config.UPSCALE_FACTOR)
        new_height = int(height * config.UPSCALE_FACTOR)
        image = image.resize((new_width, new_height), Image.LANCZOS)

    # 4. 增强对比度
    if config.PREPROCESS_ENABLED:
        image = ImageEnhance.Contrast(image).enhance(config.CONTRAST_FACTOR)
        image = ImageEnhance.Sharpness(image).enhance(config.SHARPNESS_FACTOR)

    return image


def load_image(contents: bytes) -> Image.Image:
    """从字节流加载图片，处理常见格式"""
    try:
        image = Image.open(io.BytesIO(contents))
        image.load()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法解析图片文件: {e}")
    return image


# ------------------------------------------------------------
# 行分组（保留每个单元格的几何信息）
# ------------------------------------------------------------
def group_into_lines(
    boxes: List[np.ndarray], texts: List[str], scores: List[float]
) -> List[dict]:
    """
    根据文本框坐标将识别结果按行分组。
    返回 [{ "text": "...", "cells": [...], "cell_details": [...], "y": ... }, ...]
    其中 cell_details 保留每个单元格的 x/y/w/h/cx/cy/score 几何信息，
    供下游表格重建使用（不丢失列坐标）。

    阈值根据文本框高度动态计算，避免大字号/高分辨率图片把同一表格行拆碎。
    """
    if not boxes or not texts:
        return []

    # 计算每个文本框的中心点 y 坐标和高度，用于行聚类
    items = []
    heights = []
    for box, text, score in zip(boxes, texts, scores):
        # box 是 4 个点 [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
        pts = np.array(box, dtype=float)
        cy = float(pts[:, 1].mean())
        cx = float(pts[:, 0].mean())
        h = float(pts[:, 1].max() - pts[:, 1].min())
        if h > 0:
            heights.append(h)
        items.append({"box": pts, "cy": cy, "cx": cx, "h": h, "text": text, "score": float(score)})

    if not items:
        return []

    # 动态阈值：中位文本框高度的 0.9 倍，且不低于 10 像素。
    # 较小阈值先把明显不同的表格行分开；后续 extract_table_structure 再用列互补规则
    # 合并同一表格行被 OCR 拆成的碎片（跨行单元格）。
    median_h = float(np.median(heights)) if heights else 20.0
    y_threshold = max(median_h * 0.9, 10.0)

    # 按中心 y 排序
    items.sort(key=lambda it: it["cy"])

    lines: List[dict] = []
    current_line: List[dict] = []
    current_cy: Optional[float] = None

    for item in items:
        if current_cy is None or abs(item["cy"] - current_cy) > y_threshold:
            # 新行
            if current_line:
                lines.append(finalize_line(current_line))
            current_line = [item]
            current_cy = item["cy"]
        else:
            current_line.append(item)

    if current_line:
        lines.append(finalize_line(current_line))

    # 二次合并：处理同一表格行内各单元格略有上下偏移，被初次聚类拆成多行的情况。
    # 只合并 y 距离在阈值内，或 y 距离略大但 x 覆盖高度重叠/高度互补的行；
    # 避免把两个完整的数据行误合成一行。
    merged_lines: List[dict] = []
    for line in lines:
        if not merged_lines or not line["cells"]:
            merged_lines.append(line)
            continue

        prev = merged_lines[-1]
        y_dist = abs(line["y"] - prev["y"])
        if y_dist > y_threshold * 1.2:
            merged_lines.append(line)
            continue

        prev_ranges = _x_coverage_ranges(prev["cell_details"])
        cur_ranges = _x_coverage_ranges(line["cell_details"])
        overlap_ratio = _range_overlap_ratio(prev_ranges, cur_ranges)

        # 高度重叠：同一行单元格上下偏移，y 距离可稍大
        same_row_shifted = overlap_ratio > 0.7 and y_dist <= y_threshold * 1.2
        # 高度互补：同一行被竖直切碎成左右/上下碎片，要求 y 距离很近且至少一行不完整，
        # 避免把两个完整相邻数据行误合并。
        prev_incomplete = not _row_looks_complete(prev)
        cur_incomplete = not _row_looks_complete(line)
        complementary_fragments = (
            overlap_ratio < 0.25
            and y_dist <= y_threshold * 0.8
            and (prev_incomplete or cur_incomplete)
        )
        # 表头行（包含表头关键词）之间，即使重叠中等也应合并（如"单"+"位"）
        header_merge = False
        if not same_row_shifted and not complementary_fragments:
            joined_prev = "".join(prev["cells"])
            joined_cur = "".join(line["cells"])
            header_kw_count = 0
            for group in HEADER_GROUPS:
                if any(kw in joined_prev or kw in joined_cur for kw in group):
                    header_kw_count += 1
            if header_kw_count >= 2:
                header_merge = True

        if same_row_shifted or complementary_fragments or header_merge:
            prev["cells"] = prev["cells"] + line["cells"]
            prev["cell_details"] = prev["cell_details"] + line["cell_details"]
            prev["text"] = " ".join(prev["cells"])
            prev["y"] = round(
                (prev["y"] * len(prev["cells"]) + line["y"] * len(line["cells"]))
                / (len(prev["cells"]) + len(line["cells"])),
                1,
            )
        else:
            merged_lines.append(line)

    return merged_lines


def finalize_line(items: List[dict]) -> dict:
    """按 x 坐标排序单元格，拼接整行文本，并输出单元格几何信息"""
    items_sorted = sorted(items, key=lambda it: it["cx"])
    cells = [it["text"] for it in items_sorted]
    cell_details = []
    for it in items_sorted:
        pts = it["box"]
        x0 = float(pts[:, 0].min())
        y0 = float(pts[:, 1].min())
        x1 = float(pts[:, 0].max())
        y1 = float(pts[:, 1].max())
        cell_details.append(
            {
                "text": it["text"],
                "x": round(x0, 1),
                "y": round(y0, 1),
                "w": round(x1 - x0, 1),
                "h": round(y1 - y0, 1),
                "cx": round(it["cx"], 1),
                "cy": round(it["cy"], 1),
                "score": round(float(it["score"]), 4),
            }
        )
    return {
        "text": " ".join(cells),
        "cells": cells,
        "cell_details": cell_details,
        "y": round(sum(it["cy"] for it in items_sorted) / len(items_sorted), 1),
    }


# ------------------------------------------------------------
# 几何表格重建（利用单元格坐标还原行列结构）
# ------------------------------------------------------------
# 表头关键词 → 字段名（按优先级顺序）
HEADER_KEYWORDS: Dict[str, List[str]] = {
    "index": ["序号", "编号"],
    "name": ["产品名称", "设备名称", "项目名称", "品名", "名称", "物料", "材料名称", "设备材料"],
    "model": ["规格型号", "技术参数", "规格", "型号"],
    "parameter_description": ["参数描述", "技术参数", "规格参数", "详细参数", "参数说明", "参数", "描述"],
    "brand": ["品牌", "生产厂家", "厂家", "制造商", "厂商"],
    "unit": ["单位"],
    "quantity": ["数量", "台数", "套数", "件数"],
    "unit_price": ["含税单价", "不含税单价", "单价"],
    "total_price": ["总金额", "总价", "金额", "合计金额", "小计"],
    "remark": ["备注", "说明"],
}

# 合并表头（一个单元格内含两个字段）：字段列表 + 匹配关键词
COMBINED_HEADERS: List[Tuple[List[str], List[str]]] = [
    (["unit", "quantity"], ["单位数量"]),
    (["unit_price", "total_price"], ["单价总价", "单价金额", "单价总金额"]),
    (["name", "model"], ["产品名称规格", "名称型号", "品名规格"]),
    (["name", "parameter_description"], ["产品名称参数描述", "名称参数描述"]),
]

# 表头行检测关键词组（命中 ≥2 组判定为表头行）
HEADER_GROUPS: List[List[str]] = [
    ["产品名称", "设备名称", "项目名称", "品名", "名称", "物料", "材料"],
    ["规格", "型号"],
    ["参数描述", "参数", "描述", "技术参数"],
    ["数量", "台数", "套数", "件数"],
    ["单位"],
    ["单价"],
    ["总价", "金额", "小计"],
    ["品牌", "厂家", "制造商"],
]


def classify_header_cell(text: str) -> List[str]:
    """将表头单元格文本分类为字段列表。

    支持合并表头按关键词在文本中的出现顺序拆分为多个字段，例如：
      "序号产品名称"  -> [index, name]
      "单价（元）总价（元" -> [unit_price, total_price]
      "规格型号"       -> [model]（同义关键词只保留一个字段）
    """
    clean = re.sub(r"^[\d.、．:：①②③④⑤⑥⑦⑧⑨⑩\s]+", "", text).strip()
    if not clean:
        return []

    # 1. 已知合并表头精确匹配（如 "单位数量"、"单价总价"）
    for fields, keywords in COMBINED_HEADERS:
        for kw in keywords:
            if kw in clean:
                return list(fields)

    # 2. 通用多字段识别：收集所有命中关键词，按首次出现位置排序
    found: List[Tuple[int, str]] = []
    for field, keywords in HEADER_KEYWORDS.items():
        best_pos = -1
        for kw in keywords:
            pos = clean.find(kw)
            if pos >= 0 and (best_pos < 0 or pos < best_pos):
                best_pos = pos
        if best_pos >= 0:
            found.append((best_pos, field))

    if not found:
        return []

    found.sort(key=lambda t: t[0])
    result: List[str] = []
    for _, field in found:
        if field not in result:
            result.append(field)
    return result


def detect_header_row(rows: List[dict], image_width: float) -> Optional[int]:
    """检测表头行：关键词组投票，命中 ≥2 组即为表头行，取分数最高者"""
    best_idx: Optional[int] = None
    best_score = 0
    for i, row in enumerate(rows):
        joined = "".join(c["text"] for c in row["cells"])
        if not joined:
            continue
        score = 0
        for group in HEADER_GROUPS:
            if any(kw in joined for kw in group):
                score += 1
        if score >= 2 and score > best_score:
            best_score = score
            best_idx = i
    return best_idx


def remove_title_rows(rows: List[dict], header_idx: int) -> Tuple[List[dict], int]:
    """去除表头上方 ≤2 单元格的标题行（如单据标题、公司名、询价单抬头），返回新行列表与表头新索引"""
    kept: List[dict] = []
    removed_before = 0
    for i, row in enumerate(rows):
        if i < header_idx and len(row["cells"]) <= 2:
            removed_before += 1
            continue
        kept.append(row)
    return kept, header_idx - removed_before


def map_header_to_columns(header_row: dict) -> List[Tuple[str, float]]:
    """将表头行的单元格映射为有序 [(field, cx)] 列定义"""
    header_cells = sorted(header_row["cells"], key=lambda c: c["cx"])
    columns: List[Tuple[str, float]] = []
    for cell in header_cells:
        fields = classify_header_cell(cell["text"])
        if not fields:
            continue
        if len(fields) == 1:
            columns.append((fields[0], cell["cx"]))
        else:
            # 合并表头：从单元格左边缘到右边缘均分多个列位置
            w = max(float(cell["w"]), 1.0)
            n = len(fields)
            for i, f in enumerate(fields):
                cx = float(cell["x"]) + w * (i + 0.5) / n
                columns.append((f, cx))
    return columns


def merge_overlapping_cells(row_cells: List[dict], min_gap: float) -> List[dict]:
    """
    合并同一行内 x 重叠或相邻的 OCR 碎片。
    OCR 常把一个单元格拆成多个小框：
      - 横向碎片：x 相邻，按 x 顺序拼接（如"5M"+"普耐尔氩弧焊枪"）
      - 纵向碎片：x 重叠（同一列内多行文字），按 y 顺序拼接（如型号"11kW搅拌"+"机组"）
    """
    if not row_cells:
        return []
    sorted_cells = sorted(row_cells, key=lambda c: float(c["x"]))
    merged: List[dict] = []
    for cell in sorted_cells:
        if not merged:
            merged.append(dict(cell))
            continue
        prev = merged[-1]
        prev_x1 = float(prev["x"]) + float(prev["w"])
        cur_x0 = float(cell["x"])
        cur_x1 = cur_x0 + float(cell["w"])
        # 间距小于列最小间距的 30% 视为同一单元格碎片
        if cur_x0 <= prev_x1 + min_gap * 0.3:
            overlap = max(0.0, min(prev_x1, cur_x1) - max(float(prev["x"]), cur_x0))
            is_vertical = overlap > min_gap * 0.25  # x 明显重叠 -> 纵向多行
            if is_vertical:
                texts = [(float(prev.get("y", 0)), prev["text"]), (float(cell.get("y", 0)), cell["text"])]
                texts.sort(key=lambda t: t[0])
            else:
                texts = [(float(prev["x"]), prev["text"]), (float(cell["x"]), cell["text"])]
                texts.sort(key=lambda t: t[0])
            prev["text"] = "".join(t for _, t in texts)
            prev["w"] = max(prev_x1, cur_x1) - float(prev["x"])
            prev["cx"] = float(prev["x"]) + float(prev["w"]) / 2
            prev["y"] = min(float(prev.get("y", 1e9)), float(cell.get("y", 1e9)))
        else:
            merged.append(dict(cell))
    return merged


def assign_cells_to_columns(
    row_cells: List[dict], columns: List[Tuple[str, float]], image_width: float
) -> Dict[str, str]:
    """
    将一行内的单元格按几何位置分配到列。
    - 先合并 x 重叠/相邻的 OCR 碎片（避免"5M"+"普耐尔氩弧焊枪"被拆到不同列）
    - 再按单元格 x 范围与各列的覆盖比例分配，比单纯 cx 最近邻更鲁棒
    返回 {field: 拼接文本}，仅含非空列。
    """
    if not row_cells or not columns:
        return {}

    cx_list = [cx for _, cx in columns]
    gaps = [cx_list[i + 1] - cx_list[i] for i in range(len(cx_list) - 1)]
    min_gap = min(gaps) if gaps else 100.0

    # 1. 合并同一列内的 OCR 碎片
    merged_cells = merge_overlapping_cells(row_cells, min_gap)

    # 2. 列边界：相邻列中心取中点；最左/最右列向两侧延伸半个最小间距
    boundaries: List[float] = []
    for i in range(len(columns) - 1):
        boundaries.append((cx_list[i] + cx_list[i + 1]) / 2)

    assigned: Dict[str, List[str]] = {f: [] for f, _ in columns}
    for cell in merged_cells:
        x0 = float(cell["x"])
        x1 = x0 + float(cell["w"])

        # 3. 找覆盖长度最大的列
        best_idx = 0
        best_overlap = -1.0
        for i, (_, _) in enumerate(columns):
            col_left = boundaries[i - 1] if i > 0 else max(0.0, cx_list[i] - min_gap / 2)
            col_right = boundaries[i] if i < len(boundaries) else min(image_width, cx_list[i] + min_gap / 2)
            overlap = max(0.0, min(x1, col_right) - max(x0, col_left))
            if overlap > best_overlap:
                best_overlap = overlap
                best_idx = i

        assigned[columns[best_idx][0]].append(cell["text"])

    result: Dict[str, str] = {}
    for field, texts in assigned.items():
        joined = "".join(texts).strip()
        if joined:
            result[field] = joined
    return result


def merge_name_continuation_rows(rows: List[Dict[str, str]], y_threshold: float) -> List[Dict[str, str]]:
    """
    后处理：合并同一产品名称/参数描述被 OCR 竖直拆断的延续行。
    判断当前行是否是上一行的文本延续，依据：
      - 当前行名称以明显的延续片段开头（如 "11kW/", "承：", "机：", "子(" 等）；
      - 或上一行名称未以句末标点结束，且当前行缺少完整的右侧数量/价格列。
    """
    if len(rows) <= 1:
        return rows

    ending_delimiters = "。！？;；,.，、？）)]}】…"
    continuation_prefixes = (
        "11kw", "11kW", "22kw", "22kW", "380v", "380V",
        "承：", "机：", "轴：", "电：", "电机：", "减速机：", "轴承：",
        "子(", "2.4)", "子（", "2.4）", "个5", "个1", "个11",
        "哈瓦洛", "Harbin",
    )

    merged: List[Dict[str, str]] = []
    for row in rows:
        if not merged:
            merged.append(dict(row))
            continue

        prev = merged[-1]
        # 基于列内容判断当前行是否像延续：缺少完整右侧列，且名称以延续片段开头
        prev_name = (prev.get("name") or "").strip()
        cur_name = (row.get("name") or "").strip()

        # 当前行名称明显是上一行被截断文本的延续（仅当当前行有名称时判断）
        looks_continuation = bool(cur_name) and cur_name.startswith(continuation_prefixes)
        if not looks_continuation:
            # 两个都缺少右侧数量/价格列时，若上一行名称未以标点结束，
            # 可视为跨行单元格的延续（避免把正常完整行误合并）。
            prev_has_right = bool(prev.get("quantity") or prev.get("unit") or prev.get("unit_price") or prev.get("total_price"))
            cur_has_right = bool(row.get("quantity") or row.get("unit") or row.get("unit_price") or row.get("total_price"))
            prev_ends_clean = prev_name and prev_name[-1] in ending_delimiters
            if not prev_has_right and not cur_has_right and not prev_ends_clean:
                looks_continuation = True

        # 当前行没有产品名称/型号，只有参数描述，且不是新产品开始时，
        # 可视为上一行的参数描述延续（如 PAM 搅拌罐下方的 "药孔；3条400mm支腿/不锈钢"）。
        if not looks_continuation:
            cur_is_only_desc = not row.get("name") and not row.get("model")
            prev_has_name = bool(prev.get("name") or prev.get("model"))
            pd_text = (row.get("parameter_description") or "").strip()
            is_new = _is_new_product_start(pd_text)
            if cur_is_only_desc and prev_has_name and not is_new:
                # 如果上一行已经是完整数据行（有数量/单位）且参数描述以标点结束，
                # 说明当前行更可能是新产品开始，不应继续合并。
                prev_is_complete = bool(prev.get("quantity") or prev.get("unit"))
                prev_pd = (prev.get("parameter_description") or "").strip()
                prev_pd_ends_clean = prev_pd and prev_pd[-1] in ending_delimiters
                if not (prev_is_complete and prev_pd_ends_clean):
                    looks_continuation = True

        if not looks_continuation:
            merged.append(dict(row))
            continue

        # 合并：名称拼接，其他字段优先保留已有值
        prev["name"] = (prev_name + cur_name).strip()
        for field in ["parameter_description", "model", "brand", "specifications", "unit", "quantity", "unit_price", "total_price"]:
            if field in row and row[field].strip():
                if field in prev and prev[field].strip():
                    if field in ("parameter_description", "model"):
                        # 模型/参数描述通常顺序拼接
                        prev[field] = (prev[field].strip() + " " + row[field].strip()).strip()
                    else:
                        # 其他字段保留更完整者
                        if len(row[field]) > len(prev[field]):
                            prev[field] = row[field].strip()
                else:
                    prev[field] = row[field].strip()

    # 第二次 pass：把仍孤立的 "仅有参数描述" 行合并到下一个有名称/型号的行。
    # 这能修复 Q235B 参数被错误合并到上一行产品的问题。
    final_rows: List[Dict[str, str]] = []
    pending_desc = ""
    for row in merged:
        has_name_or_model = bool(row.get("name") or row.get("model"))
        has_desc = bool(row.get("parameter_description"))
        if not has_name_or_model and has_desc:
            pending_desc = (pending_desc + " " + row.get("parameter_description", "")).strip()
            continue
        if pending_desc:
            row["parameter_description"] = (pending_desc + " " + row.get("parameter_description", "")).strip()
            pending_desc = ""
        final_rows.append(row)
    # 末尾孤立参数描述没有后续产品行，直接丢弃

    return final_rows


def extract_table_structure(lines: List[dict], image_width: float) -> Optional[Dict[str, Any]]:
    """
    从 OCR 行数据中重建表格：
    检测表头 → 去除标题行 → 表头列映射 → 数据行按几何位置分配单元格。
    返回 { "headers": [...], "rows": [{field: text}, ...] }；无法重建时返回 None。
    """
    if not lines:
        return None

    rows: List[dict] = []
    for line in lines:
        details = line.get("cell_details") or []
        if details:
            rows.append({"y": line.get("y", 0.0), "cells": details})
    if not rows:
        return None

    # 1. 检测表头行
    header_idx = detect_header_row(rows, image_width)
    if header_idx is None:
        logger.info("表格重建：未检测到表头行")
        return None

    # 2. 去除标题行
    rows, header_idx = remove_title_rows(rows, header_idx)
    if header_idx < 0 or header_idx >= len(rows):
        return None
    header_row = rows[header_idx]

    # 3. 表头列映射：先合并表头单元格碎片（如"单"+"位"），再分类字段
    merged_header_cells = merge_overlapping_cells(header_row["cells"], image_width * 0.01)
    columns = map_header_to_columns({"cells": merged_header_cells})
    if len(columns) < 2:
        logger.info("表格重建：表头列识别不足 (%d)", len(columns))
        return None
    header_fields = [f for f, _ in columns]
    logger.info("表格重建：表头列=%s", header_fields)

    # 估算行高阈值，用于合并同一表格行的碎片
    all_h = [float(c["h"]) for row in rows for c in row["cells"] if float(c.get("h", 0)) > 0]
    y_threshold = max(float(np.median(all_h)) * 1.3, 12.0) if all_h else 20.0

    # 4. 合并表头下方的数据行碎片（跨行单元格常被 OCR 拆成多行）
    data_row_candidates = rows[header_idx + 1:]
    merged_candidates = merge_fragment_rows(data_row_candidates, y_threshold)

    # 5. 数据行按几何位置分配单元格
    data_rows: List[Dict[str, str]] = []
    for row in merged_candidates:
        joined = "".join(c["text"] for c in row["cells"]).strip()
        if not joined:
            continue
        # 跳过合计/总计/备注/费用汇总等尾部行
        if re.match(r"^(合计|总计|小计|备注|说明|注[:：]|费用|税费|金额|人民币|¥|￥)", joined):
            continue
        assigned = assign_cells_to_columns(row["cells"], columns, image_width)
        # 序号列常与名称合并为一个 OCR 单元格（如 "2 提升泵"、"1 一体化污水处理设备"），尝试拆分
        idx_text = assigned.get("index", "")
        if idx_text and not assigned.get("name"):
            m = re.match(r"^(\d+)[\s.、．]*([\u4e00-\u9fa5A-Za-zφΦ×xX].*)$", idx_text)
            if m:
                assigned["index"] = m.group(1)
                assigned["name"] = m.group(2).strip()
        if not assigned.get("name") and not assigned.get("model") and not assigned.get("parameter_description"):
            continue
        data_rows.append(assigned)

    # 6. 后处理：合并被 OCR 竖直拆断的产品名称/参数描述文本延续行
    data_rows = merge_name_continuation_rows(data_rows, y_threshold)

    if not data_rows:
        logger.info("表格重建：无有效数据行")
        return None

    # 7. 后处理：OCR 有时把产品名称和参数描述识别为一个长文本框，
    # 这里按常见分隔符拆分，避免产品名称列混入过多参数描述。
    for row in data_rows:
        name = (row.get("name") or "").strip()
        if len(name) <= 20:
            continue

        # 7a. 按产品关键词边界拆分：如 "药剂搅拌系统不锈钢搅拌器/功率11kW/380V"，
        #     关键词 "搅拌系统" 后即参数描述开始。只处理关键词出现在开头附近的场景。
        kw_split = None
        for kw in _PRODUCT_KEYWORDS:
            idx = name.find(kw)
            if idx < 0 or idx > 6:
                continue
            rest = name[idx + len(kw):]
            if rest and len(rest) >= 4:
                cand = idx + len(kw)
                if kw_split is None or cand < kw_split:
                    kw_split = cand
        if kw_split and kw_split < len(name):
            rest = name[kw_split:].strip()
            row["name"] = name[:kw_split].strip()
            if rest:
                row["parameter_description"] = (rest + " " + (row.get("parameter_description") or "")).strip()
            continue

        # 7b. 无关键词边界时，按常见分隔符拆分
        for sep in ["；", ";", "\n", "，", ","]:
            idx = name.find(sep)
            if idx > 0 and idx < len(name) - 1:
                rest = name[idx + 1:].strip()
                # 拆分出的后半段应是参数描述内容
                if rest:
                    row["name"] = name[:idx].strip()
                    row["parameter_description"] = (rest + " " + (row.get("parameter_description") or "")).strip()
                break

    # 7c. 参数描述去重：OCR 常把同一参数内容识别到名称列与参数列各一次，
    #     导致最终参数描述出现重复段落，这里统一清理。
    for row in data_rows:
        pd_text = (row.get("parameter_description") or "").strip()
        if pd_text:
            row["parameter_description"] = _dedupe_repeated_fragments(pd_text)

    return {"headers": header_fields, "rows": data_rows}


def _x_coverage_ranges(cells: List[dict]) -> List[Tuple[float, float]]:
    """把单元格按 x 合并成连续覆盖区间"""
    if not cells:
        return []
    sorted_cells = sorted(cells, key=lambda c: float(c["x"]))
    ranges: List[Tuple[float, float]] = []
    for c in sorted_cells:
        x0 = float(c["x"])
        x1 = x0 + float(c["w"])
        if ranges and x0 <= ranges[-1][1]:
            ranges[-1] = (ranges[-1][0], max(ranges[-1][1], x1))
        else:
            ranges.append((x0, x1))
    return ranges


def _range_overlap_ratio(
    ranges_a: List[Tuple[float, float]], ranges_b: List[Tuple[float, float]]
) -> float:
    """计算两个 x 覆盖区间的交集长度 / 并集长度"""
    if not ranges_a or not ranges_b:
        return 0.0

    # 并集
    all_ranges = sorted(ranges_a + ranges_b, key=lambda r: r[0])
    union: List[Tuple[float, float]] = []
    for r in all_ranges:
        if union and r[0] <= union[-1][1]:
            union[-1] = (union[-1][0], max(union[-1][1], r[1]))
        else:
            union.append(r)

    # 交集
    intersection = 0.0
    i = j = 0
    while i < len(ranges_a) and j < len(ranges_b):
        a, b = ranges_a[i], ranges_b[j]
        inter = max(0.0, min(a[1], b[1]) - max(a[0], b[0]))
        intersection += inter
        if a[1] < b[1]:
            i += 1
        else:
            j += 1

    union_len = sum(r[1] - r[0] for r in union)
    return intersection / union_len if union_len > 0 else 0.0


def _row_looks_complete(row: dict) -> bool:
    """粗略判断一行是否已经是完整的表格行（用于避免把多个数据行误合并）。"""
    cells = row.get("cells", [])
    if len(cells) >= 4:
        return True
    if len(cells) >= 2:
        long_texts = [
            c for c in cells
            if len((c.get("text", "") if isinstance(c, dict) else str(c)).strip()) >= 4
        ]
        if len(long_texts) >= 2:
            return True
    return False


# 常见产品关键词（用于识别当前行是否是一个新产品的开始）
# 只保留高置信度的独立产品名称，避免通用部件词把参数描述误判为新产品。
_PRODUCT_KEYWORDS: Tuple[str, ...] = (
    "羊毛轮", "抛光蜡", "枪尾", "夹子", "氩弧焊枪",
    "搅拌罐", "搅拌系统", "储罐", "反应釜",
    "水泵", "风机", "空压机", "切割机", "打磨机",
    "压缩机", "发电机", "钻机",
)


def _row_has_quantity_indicator(cells: List[Union[str, dict]]) -> bool:
    """判断一行是否包含数量+单位的指示（说明它可能已经是完整数据行）"""
    joined = "".join(
        (c.get("text", "") if isinstance(c, dict) else str(c)) for c in cells
    )
    if not re.search(r"\d", joined):
        return False
    # 常见数量单位
    unit_pattern = r"[个套台只件组批根块米吨支瓶袋箱条桶]"
    return bool(re.search(unit_pattern, joined))


def _row_contains_product_keyword(cells: List[Union[str, dict]]) -> bool:
    """判断一行文本是否包含独立的产品名称关键词"""
    joined = "".join(
        (c.get("text", "") if isinstance(c, dict) else str(c)) for c in cells
    )
    return any(kw in joined for kw in _PRODUCT_KEYWORDS)


def _is_new_product_start(text: str) -> bool:
    """判断一段参数描述文本是否以新产品名称开头"""
    if not text:
        return False
    first = text.split("；", 1)[0].split(";", 1)[0].split("，", 1)[0].split(",", 1)[0]
    return any(first.startswith(kw) for kw in _PRODUCT_KEYWORDS)


def _dedupe_repeated_fragments(text: str) -> str:
    """
    去除参数描述中 OCR 重复识别的片段。
    跨行单元格常被 OCR 识别两次（一次在名称列、一次在参数列），
    导致参数描述里出现高度重叠的重复段落。保留首次出现，删除后续重复。
    """
    if not text:
        return text
    tokens = re.split(r"([\s；;，,、]+)", text)
    kept: List[str] = []
    kept_text = ""
    skip_sep = False
    for tok in tokens:
        if not tok:
            continue
        # 分隔符 token：若紧跟在被跳过的重复片段后，一并跳过（避免残留 "  ；"）
        if re.fullmatch(r"[\s；;，,、]+", tok):
            if not skip_sep:
                kept.append(tok)
                kept_text += tok
            continue
        if len(tok.strip()) < 6:
            skip_sep = False
            kept.append(tok)
            kept_text += tok
            continue
        overlap = sum(1 for ch in tok if ch in kept_text)
        if kept_text and overlap / len(tok) > 0.6:
            skip_sep = True
            continue
        skip_sep = False
        kept.append(tok)
        kept_text += tok
    return "".join(kept).rstrip(" ；;，,、\t\n")


def _looks_like_continuation(prev: dict, row: dict) -> bool:
    """
    判断当前行是否是上一行某个跨行单元格的文本延续。
    常见模式：当前行与上一行共享左侧名称/参数描述列，且上一行文本被截断
    （未以句末标点结束），下一行是其延续。
    """
    prev_cells = sorted(prev.get("cells", []), key=lambda c: c.get("cx", c["x"]))
    cur_cells = sorted(row.get("cells", []), key=lambda c: c.get("cx", c["x"]))
    if not prev_cells or not cur_cells:
        return False

    # 估算页面宽度
    all_cells = prev_cells + cur_cells
    image_width_est = max(c.get("x", 0) + c.get("w", 0) for c in all_cells) * 1.1
    if image_width_est <= 0:
        return False

    # 如果当前行已经包含独立的产品名称关键词，说明它是新产品的开始，不合并到上一行。
    if _row_contains_product_keyword(cur_cells):
        return False

    # 如果两行都包含最右侧数量/价格列，说明它们是两个完整数据行，不合并。
    # 参数描述列虽然也在右侧，但通常不会落到最右侧 12% 区域内。
    right_threshold = image_width_est * 0.88
    prev_has_right = any(c.get("cx", c["x"]) > right_threshold for c in prev_cells)
    cur_has_right = any(c.get("cx", c["x"]) > right_threshold for c in cur_cells)
    if prev_has_right and cur_has_right:
        return False

    # 当前行必须仍有单元格落在左侧名称/参数区域，才可能是跨行文本的延续
    if not any(c.get("cx", c["x"]) < image_width_est * 0.65 for c in cur_cells):
        return False

    # 检查当前行最左侧单元格是否与上一行最左侧单元格在同一列（x 覆盖）
    pc = prev_cells[0]
    cc = cur_cells[0]
    overlap = min(cc["x"] + cc["w"], pc["x"] + pc["w"]) - max(cc["x"], pc["x"])
    if overlap <= min(cc["w"], pc["w"]) * 0.2:
        return False

    pt = pc.get("text", "")
    # 如果上一行文本以句末/分节标点结束，认为已完结，不再合并
    ending_delimiters = "。！？;；,.，、？）)]}】…"
    if pt and pt[-1] in ending_delimiters:
        return False

    return True


def merge_fragment_rows(rows: List[dict], y_threshold: float) -> List[dict]:
    """
    合并同一表格行被 OCR 拆成的多行碎片。

    两类碎片需要合并：
    1. 列互补：相邻行 x 覆盖交集很小，且至少一行不完整。
    2. 跨行单元格：同一列内容被 OCR 竖直拆成多行，当前行是上一行的文本延续。
    """
    if len(rows) <= 1:
        return rows

    merged: List[dict] = []
    for row in rows:
        if not merged:
            merged.append({"y": row["y"], "cells": list(row["cells"]), "text": row.get("text", "")})
            continue

        prev = merged[-1]
        y_diff = abs(row["y"] - prev["y"])
        if y_diff > y_threshold * 1.5:
            merged.append({"y": row["y"], "cells": list(row["cells"]), "text": row.get("text", "")})
            continue

        ratio = _range_overlap_ratio(
            _x_coverage_ranges(prev["cells"]), _x_coverage_ranges(row["cells"])
        )
        prev_complete = _row_looks_complete(prev)
        row_complete = _row_looks_complete(row)
        continuation = _looks_like_continuation(prev, row)

        should_merge = False
        cur_has_product_kw = _row_contains_product_keyword(row["cells"])
        if ratio < 0.35 and (not prev_complete or not row_complete) and not cur_has_product_kw:
            # 列互补碎片（当前行不是新产品开始）
            should_merge = True
        elif continuation and not cur_has_product_kw:
            # 跨行单元格的文本延续（当前行不是新产品开始）
            should_merge = True

        if should_merge:
            total_cells = len(prev["cells"]) + len(row["cells"])
            prev["y"] = round(
                (prev["y"] * len(prev["cells"]) + row["y"] * len(row["cells"])) / total_cells, 1
            )
            prev["cells"] = prev["cells"] + list(row["cells"])
            prev["text"] = " ".join(c["text"] for c in sorted(prev["cells"], key=lambda c: c["cx"]))
        else:
            merged.append({"y": row["y"], "cells": list(row["cells"]), "text": row.get("text", "")})

    return merged


# ------------------------------------------------------------
# 接口
# ------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "service": "ocr-service", "engine": "rapidocr"}


@app.post("/extract")
async def extract_text(file: UploadFile = File(...)):
    """
    接收图片文件，执行 OCR 识别，返回结构化结果。

    请求：multipart/form-data，字段名 file
    响应：{ success, text, lines, table, product_count, elapsed_ms }
    """
    start = time.time()

    # 1. 读取上传内容
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="上传文件为空")
    logger.info("收到识别请求: %s (%d bytes)", file.filename, len(contents))

    # 2. 加载并预处理图片
    try:
        image = load_image(contents)
        processed = preprocess_image(image)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("图片处理失败: %s", e)
        return JSONResponse(
            {"success": False, "error": f"图片处理失败: {e}", "text": "", "lines": []},
            status_code=500,
        )

    # 3. OCR 识别
    try:
        ocr = get_ocr_engine()
        result = ocr(np.array(processed.convert("RGB")))
    except Exception as e:
        logger.error("OCR 识别失败: %s", e)
        return JSONResponse(
            {"success": False, "error": f"OCR 识别失败: {e}", "text": "", "lines": []},
            status_code=500,
        )

    elapsed = int((time.time() - start) * 1000)

    # 4. 解析结果
    # RapidOCR 1.3.24 返回 (result_data, elapse)，
    # result_data 为 [box(4点坐标), text, score] 列表或 None
    if result is None:
        return JSONResponse(
            {
                "success": True,
                "text": "",
                "lines": [],
                "table": None,
                "product_count": 0,
                "elapsed_ms": elapsed,
            }
        )

    # 兼容不同版本返回值：
    #   新版 (data, elapse) / (data, elapse_txt)；旧版 (boxes, texts, scores)
    if isinstance(result, tuple) and len(result) == 2 and isinstance(result[1], (list, tuple)):
        result_data = result[0]
        if result_data is None:
            return JSONResponse(
                {
                    "success": True,
                    "text": "",
                    "lines": [],
                    "table": None,
                    "product_count": 0,
                    "elapsed_ms": elapsed,
                }
            )
        # result_data: [[box, text, score], ...]
        try:
            boxes = [item[0] for item in result_data]
            texts = [item[1] for item in result_data]
            scores = [item[2] for item in result_data]
        except Exception:
            # 兜底：直接将列表按 3 组解包
            boxes, texts, scores = result_data
    else:
        boxes, texts, scores = result

    # 过滤空文本
    valid = [(b, t, s) for b, t, s in zip(boxes, texts, scores) if t and t.strip()]
    if not valid:
        return JSONResponse(
            {
                "success": True,
                "text": "",
                "lines": [],
                "table": None,
                "product_count": 0,
                "elapsed_ms": elapsed,
            }
        )

    valid_boxes, valid_texts, valid_scores = zip(*valid)
    all_text = " ".join(valid_texts)
    lines = group_into_lines(list(valid_boxes), list(valid_texts), list(valid_scores))

    # 5. 几何表格重建（返回 None 时由客户端降级为文本解析）
    table = None
    try:
        table = extract_table_structure(lines, float(processed.size[0]))
    except Exception as e:
        logger.warning("表格结构提取失败（降级为文本解析）: %s", e)
        table = None

    product_count = len(table["rows"]) if table else len(lines)
    logger.info(
        "识别完成: %d 行, 表格 %d 行, 耗时 %dms",
        len(lines),
        product_count,
        elapsed,
    )

    return JSONResponse(
        {
            "success": True,
            "text": all_text,
            "lines": lines,
            "table": table,
            "product_count": product_count,
            "elapsed_ms": elapsed,
        }
    )


# ------------------------------------------------------------
# 补充接口：base64 直接提交（供内网调试/脚本使用）
# ------------------------------------------------------------
@app.post("/extract_base64")
async def extract_base64(payload: dict):
    """
    接收 base64 图片，执行 OCR 识别。

    请求体：{ "image": "<base64>", "filename": "optional.jpg" }
    """
    b64 = payload.get("image", "")
    if not b64:
        raise HTTPException(status_code=400, detail="缺少 image 字段")

    # 兼容 data URL 前缀
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[-1]

    try:
        contents = base64.b64decode(b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"base64 解码失败: {e}")

    return await extract_text(UploadFile(file=io.BytesIO(contents)))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.SERVICE_HOST, port=config.SERVICE_PORT)
