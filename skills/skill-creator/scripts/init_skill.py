#!/usr/bin/env python3
"""
技能初始化器 - 从模板创建新技能

用法:
    init_skill.py <skill-name> --path <path>

示例:
    init_skill.py my-new-skill --path skills/public
    init_skill.py my-api-helper --path skills/private
    init_skill.py custom-skill --path /custom/location
"""

import sys
from pathlib import Path


SKILL_TEMPLATE = """---
name: {skill_name}
description: [待完成: 完整且信息丰富的说明，描述技能做什么以及何时使用。包括何时使用此技能 - 触发它的具体场景、文件类型或任务。]
---

# {skill_title}

## 概述

[待完成: 1-2 句话说明此技能能做什么]

## 技能结构设计

[待完成: 选择最适合此技能目的的结构。常见模式:

**1. 基于工作流**（最适合顺序流程）
- 当有清晰的逐步程序时效果好
- 示例: DOCX 技能使用"工作流决策树"→"读取"→"创建"→"编辑"
- 结构: ## 概述 → ## 工作流决策树 → ## 步骤 1 → ## 步骤 2...

**2. 基于任务**（最适合工具集合）
- 当技能提供不同的操作/功能时效果好
- 示例: PDF 技能使用"快速开始"→"合并 PDF"→"拆分 PDF"→"提取文本"
- 结构: ## 概述 → ## 快速开始 → ## 任务类别 1 → ## 任务类别 2...

**3. 参考/指南**（最适合标准或规范）
- 适用于品牌指南、编码标准或需求
- 示例: 品牌样式使用"品牌指南"→"颜色"→"排版"→"功能"
- 结构: ## 概述 → ## 指南 → ## 规范 → ## 用法...

**4. 基于能力**（最适合集成系统）
- 当技能提供多个相互关联的功能时效果好
- 示例: 产品管理使用"核心能力"→ 编号能力列表
- 结构: ## 概述 → ## 核心能力 → ### 1. 功能 → ### 2. 功能...

模式可以根据需要混合搭配。大多数技能会组合模式（例如，以基于任务开始，为复杂操作添加工作流）。

完成后删除整个"技能结构设计"部分 - 这只是指导。]

## [待完成: 根据选择的结构替换为第一个主要部分]

[待完成: 在此添加内容。参见现有技能中的示例:
- 技术技能的代码示例
- 复杂工作流的决策树
- 带有实际用户请求的具体示例
- 根据需要引用脚本/模板/参考文档]

## 资源

此技能包含示例资源目录，演示如何组织不同类型的捆绑资源:

### scripts/
可直接运行以执行特定操作的可执行代码（Python/Bash 等）。

**其他技能中的示例:**
- PDF 技能: `fill_fillable_fields.py`, `extract_form_field_info.py` - PDF 操作工具
- DOCX 技能: `document.py`, `utilities.py` - 文档处理的 Python 模块

**适用于:** Python 脚本、shell 脚本或执行自动化、数据处理或特定操作的任何可执行代码。

**注意:** 脚本可以在不加载到上下文的情况下执行，但 Agent 仍可以读取它们以进行修补或环境调整。

### references/
旨在加载到上下文中以指导 Agent 过程和思考的文档和参考材料。

**其他技能中的示例:**
- 产品管理: `communication.md`, `context_building.md` - 详细的工作流指南
- BigQuery: API 参考文档和查询示例
- 财务: 模式文档、公司政策

**适用于:** 深入文档、API 参考、数据库模式、综合指南，或 Agent 在工作时应该参考的任何详细信息。

### assets/
不打算加载到上下文的文件，而是用于 Agent 生成的输出。

**其他技能中的示例:**
- 品牌样式: PowerPoint 模板文件 (.pptx)、logo 文件
- 前端构建器: HTML/React 模板项目目录
- 排版: 字体文件 (.ttf, .woff2)

**适用于:** 模板、模板代码、文档模板、图像、图标、字体，或任何打算复制或用于最终输出的文件。

---

**任何不需要的目录可以删除。** 并非每个技能都需要所有三种类型的资源。
"""

EXAMPLE_SCRIPT = '''#!/usr/bin/env python3
"""
{skill_name} 的示例辅助脚本

这是一个可以直接执行的占位脚本。
替换为实际实现或在不需要时删除。

其他技能中的实际脚本示例:
- pdf/scripts/fill_fillable_fields.py - 填写 PDF 表单字段
- pdf/scripts/convert_pdf_to_images.py - 将 PDF 页面转换为图像
"""

def main():
    print("这是 {skill_name} 的示例脚本")
    # 待完成: 在此添加实际脚本逻辑
    # 可以是数据处理、文件转换、API 调用等

if __name__ == "__main__":
    main()
'''

EXAMPLE_REFERENCE = """# {skill_title} 参考文档

这是详细参考文档的占位符。
替换为实际参考内容或在不需要时删除。

其他技能中的实际参考文档示例:
- product-management/references/communication.md - 状态更新综合指南
- product-management/references/context_building.md - 收集上下文的深入指南
- bigquery/references/ - API 参考和查询示例

## 何时参考文档有用

参考文档适用于:
- 全面的 API 文档
- 详细的工作流指南
- 复杂的多步骤流程
- 对主 SKILL.md 来说太长的信息
- 仅特定用例需要的内容

## 结构建议

### API 参考示例
- 概述
- 认证
- 带示例的端点
- 错误代码
- 速率限制

### 工作流指南示例
- 前提条件
- 逐步说明
- 常见模式
- 故障排除
- 最佳实践
"""

EXAMPLE_ASSET = """# 示例素材文件

此占位符表示素材文件的存放位置。
替换为实际素材文件（模板、图像、字体等）或在不需要时删除。

素材文件不打算加载到上下文中，而是用于 Agent 生成的输出。

其他技能中的素材文件示例:
- 品牌指南: logo.png, slides_template.pptx
- 前端构建器: hello-world/ 目录包含 HTML/React 模板
- 排版: custom-font.ttf, font-family.woff2
- 数据: sample_data.csv, test_dataset.json

## 常见素材类型

- 模板: .pptx, .docx, 模板目录
- 图像: .png, .jpg, .svg, .gif
- 字体: .ttf, .otf, .woff, .woff2
- 模板代码: 项目目录、启动文件
- 图标: .ico, .svg
- 数据文件: .csv, .json, .xml, .yaml

注意: 这是文本占位符。实际素材可以是任何文件类型。
"""


def title_case_skill_name(skill_name):
    """将连字符分隔的技能名称转换为标题大小写用于显示。"""
    return ' '.join(word.capitalize() for word in skill_name.split('-'))


KERNEL_MARKERS = ("core/skills/builtin", "core/subagents/builtin")


def init_skill(skill_name, path):
    """
    使用模板 SKILL.md 初始化新技能目录。

    参数:
        skill_name: 技能名称
        path: 应创建技能目录的路径

    返回:
        创建的技能目录路径，如果出错则返回 None
    """
    # 确定技能目录路径
    skill_dir = Path(path).resolve() / skill_name

    # 拒绝在内核目录创建技能
    resolved_str = str(skill_dir)
    for marker in KERNEL_MARKERS:
        if marker in resolved_str:
            print(f"❌ 错误: 禁止在内核目录创建技能: {skill_dir}")
            print(f"   内核目录为只读，由系统维护。")
            print(f"   请使用 Agent 级目录，例如: --path skills")
            return None

    # 检查目录是否已存在
    if skill_dir.exists():
        print(f"❌ 错误: 技能目录已存在: {skill_dir}")
        return None

    # 创建技能目录
    try:
        skill_dir.mkdir(parents=True, exist_ok=False)
        print(f"✅ 已创建技能目录: {skill_dir}")
    except Exception as e:
        print(f"❌ 创建目录错误: {e}")
        return None

    # 从模板创建 SKILL.md
    skill_title = title_case_skill_name(skill_name)
    skill_content = SKILL_TEMPLATE.format(
        skill_name=skill_name,
        skill_title=skill_title
    )

    skill_md_path = skill_dir / 'SKILL.md'
    try:
        skill_md_path.write_text(skill_content)
        print("✅ 已创建 SKILL.md")
    except Exception as e:
        print(f"❌ 创建 SKILL.md 错误: {e}")
        return None

    # 创建带有示例文件的资源目录
    try:
        # 创建 scripts/ 目录和示例脚本
        scripts_dir = skill_dir / 'scripts'
        scripts_dir.mkdir(exist_ok=True)
        example_script = scripts_dir / 'example.py'
        example_script.write_text(EXAMPLE_SCRIPT.format(skill_name=skill_name))
        example_script.chmod(0o755)
        print("✅ 已创建 scripts/example.py")

        # 创建 references/ 目录和示例参考文档
        references_dir = skill_dir / 'references'
        references_dir.mkdir(exist_ok=True)
        example_reference = references_dir / 'api_reference.md'
        example_reference.write_text(EXAMPLE_REFERENCE.format(skill_title=skill_title))
        print("✅ 已创建 references/api_reference.md")

        # 创建 assets/ 目录和示例素材占位符
        assets_dir = skill_dir / 'assets'
        assets_dir.mkdir(exist_ok=True)
        example_asset = assets_dir / 'example_asset.txt'
        example_asset.write_text(EXAMPLE_ASSET)
        print("✅ 已创建 assets/example_asset.txt")
    except Exception as e:
        print(f"❌ 创建资源目录错误: {e}")
        return None

    # 打印后续步骤
    print(f"\n✅ 技能 '{skill_name}' 初始化成功，位置: {skill_dir}")
    print("\n后续步骤:")
    print("1. 编辑 SKILL.md 完成待完成项并更新描述")
    print("2. 自定义或删除 scripts/、references/ 和 assets/ 中的示例文件")
    print(f"3. 测试脚本时从会话目录运行（如 python skills/{skill_name}/scripts/xxx.py），产出文件会保存到会话目录")

    return skill_dir


def main():
    if len(sys.argv) < 4 or sys.argv[2] != '--path':
        print("用法: init_skill.py <skill-name> --path <path>")
        print("\n技能名称要求:")
        print("  - 连字符分隔的标识符（如 'data-analyzer'）")
        print("  - 仅限小写字母、数字和连字符")
        print("  - 最多 40 个字符")
        print("  - 必须与目录名完全匹配")
        print("\n示例:")
        print("  init_skill.py my-new-skill --path skills/public")
        print("  init_skill.py my-api-helper --path skills/private")
        print("  init_skill.py custom-skill --path /custom/location")
        sys.exit(1)

    skill_name = sys.argv[1]
    path = sys.argv[3]

    print(f"🚀 正在初始化技能: {skill_name}")
    print(f"   位置: {path}")
    print()

    result = init_skill(skill_name, path)

    if result:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
