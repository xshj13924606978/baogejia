#!/usr/bin/env python3
"""
OpenClaw CNC 桥接脚本
通过 stdin 接收 JSON 指令，通过 stdout 输出 JSON 结果。

支持指令：
- analyze: 分析图纸/模型文件，提取包围盒尺寸、体积、表面积等
- quote:   根据材料与尺寸参数计算 CNC 加工报价

用法示例：
  echo '{"action":"analyze","filePath":"/tmp/model.step","fileName":"model.step"}' | python bridge.py
  echo '{"action":"quote","material":"铝合金","length":100,"width":50,"height":10,"quantity":10}' | python bridge.py
"""

import json
import os
import sys
import traceback

# ---------------------------------------------------------------------------
# 材料单价表（元 / kg），用于报价估算
# ---------------------------------------------------------------------------
MATERIAL_PRICES = {
    '铝合金': 35,
    '铝': 35,
    '6061铝合金': 45,
    '7075铝合金': 60,
    '不锈钢': 22,
    '304不锈钢': 24,
    '316不锈钢': 30,
    '碳钢': 8,
    '45钢': 10,
    'Q235': 6,
    '模具钢': 25,
    'P20模具钢': 30,
    '铜': 60,
    '黄铜': 55,
    '紫铜': 70,
    'POM': 30,
    '尼龙': 28,
    'PA66': 30,
    'ABS': 25,
    'PC': 40,
    'PEEK': 600,
    '钛合金': 300,
    'TC4钛合金': 350,
}

# 材料密度表（g/cm³），用于估算质量
MATERIAL_DENSITIES = {
    '铝合金': 2.70,
    '铝': 2.70,
    '6061铝合金': 2.70,
    '7075铝合金': 2.81,
    '不锈钢': 7.93,
    '304不锈钢': 7.93,
    '316不锈钢': 7.98,
    '碳钢': 7.85,
    '45钢': 7.85,
    'Q235': 7.85,
    '模具钢': 7.85,
    'P20模具钢': 7.85,
    '铜': 8.96,
    '黄铜': 8.50,
    '紫铜': 8.96,
    'POM': 1.41,
    '尼龙': 1.14,
    'PA66': 1.14,
    'ABS': 1.05,
    'PC': 1.20,
    'PEEK': 1.32,
    '钛合金': 4.51,
    'TC4钛合金': 4.43,
}

# 表面处理单价（元 / dm²）
SURFACE_TREATMENT_PRICES = {
    '阳极氧化': 1.5,
    '硬质阳极氧化': 3.5,
    '镀锌': 1.2,
    '镀镍': 2.5,
    '镀铬': 3.0,
    '喷砂': 1.0,
    '抛光': 2.0,
    '拉丝': 1.8,
    '喷漆': 2.5,
    '无': 0.0,
}


def _round(value, digits=2):
    """安全四舍五入，处理 None/NaN"""
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# analyze：图纸/模型分析
# ---------------------------------------------------------------------------
def analyze_drawing(params):
    file_path = params.get('filePath', '')
    file_name = params.get('fileName', '') or os.path.basename(file_path)
    density = params.get('density')

    if not file_path or not os.path.exists(file_path):
        return {'success': False, 'error': f'文件不存在: {file_path}'}

    ext = os.path.splitext(file_name or file_path)[1].lower().lstrip('.')
    if not ext:
        ext = os.path.splitext(file_path)[1].lower().lstrip('.')

    warnings = []

    # --- STEP / STP：使用 cadquery 导入 ---
    if ext in ('step', 'stp'):
        try:
            import cadquery as cq
            result = cq.importers.importStep(file_path)
            solid = result.val()
            bb = solid.BoundingBox()
            dims = {
                'length': _round(bb.xlen),
                'width': _round(bb.ylen),
                'height': _round(bb.zlen),
            }
            volume = solid.Volume()
            area = solid.Area()
        except Exception as e:
            return {'success': False, 'error': f'STEP 文件解析失败: {e}'}

    # --- STL / OBJ / PLY：使用 trimesh 读取 ---
    elif ext in ('stl', 'obj', 'ply', 'glb', 'gltf'):
        try:
            import trimesh
            mesh = trimesh.load(file_path, force='mesh')
            dims = {
                'length': _round(mesh.bounds[1][0] - mesh.bounds[0][0]),
                'width': _round(mesh.bounds[1][1] - mesh.bounds[0][1]),
                'height': _round(mesh.bounds[1][2] - mesh.bounds[0][2]),
            }
            volume = mesh.volume
            area = mesh.area
            if not volume or volume <= 0:
                warnings.append('网格模型体积为零或未封闭，无法准确计算体积')
        except Exception as e:
            return {'success': False, 'error': f'{ext.upper()} 文件解析失败: {e}'}

    # --- DXF：使用 ezdxf 解析二维图纸 ---
    elif ext == 'dxf':
        try:
            import ezdxf
            doc = ezdxf.readfile(file_path)
            msp = doc.modelspace()
            xs, ys = [], []
            entity_count = 0
            for e in msp:
                entity_count += 1
                try:
                    if e.dxftype() in ('LINE', 'LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'SPLINE', 'ELLIPSE'):
                        xs.append(e.dxf.start.x)
                        ys.append(e.dxf.start.y)
                        xs.append(e.dxf.end.x)
                        ys.append(e.dxf.end.y)
                except AttributeError:
                    pass
            if xs and ys:
                dims = {
                    'length': _round(max(xs) - min(xs)),
                    'width': _round(max(ys) - min(ys)),
                    'height': 0,
                }
            else:
                dims = {'length': 0, 'width': 0, 'height': 0}
                warnings.append('未能在 DXF 中提取到有效几何尺寸')
            volume = 0
            area = 0
            warnings.append('DXF 为二维图纸，体积与表面积不适用')
            return {
                'success': True,
                'format': 'dxf',
                'fileName': file_name,
                'dimensions': dims,
                'volume': 0,
                'surfaceArea': 0,
                'featureCount': entity_count,
                'warnings': warnings,
            }
        except Exception as e:
            return {'success': False, 'error': f'DXF 文件解析失败: {e}'}

    # --- 图片：PNG / JPG / JPEG ---
    elif ext in ('png', 'jpg', 'jpeg', 'bmp', 'webp'):
        try:
            from PIL import Image
            img = Image.open(file_path)
            width_px, height_px = img.size
            dims = {
                'length': width_px,
                'width': height_px,
                'height': 0,
            }
            volume = 0
            area = 0
            warnings.append('图片格式无法提取真实物理尺寸，仅返回像素尺寸，请结合比例尺换算')
            return {
                'success': True,
                'format': ext,
                'fileName': file_name,
                'dimensions': dims,
                'volume': 0,
                'surfaceArea': 0,
                'featureCount': 0,
                'warnings': warnings,
            }
        except Exception as e:
            return {'success': False, 'error': f'图片解析失败: {e}'}

    else:
        return {'success': False, 'error': f'不支持的文件格式: .{ext}'}

    # 质量估算
    density_value = None
    mass = None
    if density:
        density_value = float(density)
    elif ext in ('step', 'stp'):
        density_value = 2.70
    if density_value and volume and volume > 0:
        mass = _round(volume * density_value / 1_000_000, 3)  # mm³ * g/cm³ / 1e6 = kg

    return {
        'success': True,
        'format': ext,
        'fileName': file_name,
        'dimensions': dims,
        'volume': _round(volume, 2),
        'surfaceArea': _round(area, 2),
        'mass': mass,
        'density': density_value,
        'featureCount': 0,
        'warnings': warnings,
    }


# ---------------------------------------------------------------------------
# quote：CNC 加工报价
# ---------------------------------------------------------------------------
def generate_quote(params):
    material = params.get('material', '')
    try:
        length = float(params.get('length', 0))
        width = float(params.get('width', 0))
        height = float(params.get('height', 0))
    except (TypeError, ValueError):
        return {'success': False, 'error': '尺寸参数无效'}

    try:
        quantity = int(params.get('quantity', 1))
    except (TypeError, ValueError):
        quantity = 1
    if quantity <= 0:
        quantity = 1

    tolerance = params.get('tolerance', '±0.1mm')
    surface_treatment = params.get('surfaceTreatment', '无') or '无'
    complexity = params.get('complexity', 'medium')

    if length <= 0 or width <= 0 or height <= 0:
        return {'success': False, 'error': '长、宽、高必须大于 0'}

    # 材料单价与密度
    unit_price = MATERIAL_PRICES.get(material)
    density = MATERIAL_DENSITIES.get(material)
    if not unit_price:
        unit_price = 30  # 未知材料按 30 元/kg 估算
    if not density:
        density = 7.85

    # 体积（mm³）与质量（kg）
    volume = length * width * height
    mass = volume * density / 1_000_000  # g/cm³ * mm³ / 1e6 = kg

    # 材料成本 = 质量 × 单价（含损耗系数 1.3）
    material_cost = mass * unit_price * 1.3

    # 加工成本估算（按体积与复杂度）
    complexity_factor = {'low': 0.8, 'medium': 1.0, 'high': 1.5}.get(complexity, 1.0)
    machining_base = max(20, volume / 100_000)  # 每 10 万 mm³ 约 20 元
    machining_cost = machining_base * complexity_factor

    # 公差成本
    tolerance_factor = 1.0
    if tolerance and '0.05' in tolerance:
        tolerance_factor = 1.3
    elif tolerance and '0.02' in tolerance:
        tolerance_factor = 1.6
    elif tolerance and '0.01' in tolerance:
        tolerance_factor = 2.0
    machining_cost *= tolerance_factor

    # 表面处理成本：按表面积估算（dm²）
    surface_area = 2 * (length * width + length * height + width * height)  # mm²
    treatment_price = SURFACE_TREATMENT_PRICES.get(surface_treatment, 0)
    surface_treatment_cost = surface_area / 100_000 * treatment_price

    # 装夹/编程准备成本（首件摊薄）
    setup_cost = 150 + (30 if complexity == 'high' else 0)

    # 单件成本与总价
    unit_machining = material_cost + machining_cost + surface_treatment_cost
    unit_price_final = unit_machining + setup_cost / quantity
    total_price = unit_price_final * quantity

    # 交付周期
    delivery_days = 3
    if quantity > 50:
        delivery_days = 7
    elif quantity > 10:
        delivery_days = 5
    if complexity == 'high':
        delivery_days += 2

    breakdown = [
        {'label': '材料成本', 'amount': _round(material_cost)},
        {'label': '加工成本', 'amount': _round(machining_cost)},
        {'label': '表面处理', 'amount': _round(surface_treatment_cost)},
        {'label': '装夹/编程准备', 'amount': _round(setup_cost / quantity)},
    ]

    return {
        'success': True,
        'material': material,
        'materialCost': _round(material_cost),
        'machiningCost': _round(machining_cost),
        'surfaceTreatmentCost': _round(surface_treatment_cost),
        'setupCost': _round(setup_cost),
        'unitPrice': _round(unit_price_final),
        'totalPrice': _round(total_price),
        'deliveryDays': delivery_days,
        'breakdown': breakdown,
    }


# ---------------------------------------------------------------------------
# 入口：读取 stdin JSON，分发指令，输出 stdout JSON
# ---------------------------------------------------------------------------
def main():
    result = {'success': False, 'error': 'unknown error'}
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            result = {'success': False, 'error': '缺少输入指令'}
        else:
            req = json.loads(raw)
            action = req.get('action', '')
            if action == 'analyze':
                result = analyze_drawing(req)
            elif action == 'quote':
                result = generate_quote(req)
            else:
                result = {'success': False, 'error': f'未知指令: {action}'}
    except json.JSONDecodeError as e:
        result = {'success': False, 'error': f'JSON 解析失败: {e}'}
    except Exception as e:
        result = {'success': False, 'error': str(e), 'trace': traceback.format_exc()}

    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()


if __name__ == '__main__':
    main()
