# 编辑演示文稿

## 基于模板的工作流

当使用现有演示文稿作为模板时：

1. **分析现有幻灯片**：
   ```bash
   python scripts/thumbnail.py template.pptx
   python -m markitdown template.pptx
   ```
   查看 `thumbnails.jpg` 了解布局，查看 markitdown 输出了解占位文本。

2. **规划幻灯片映射**：为每个内容部分选择一个模板幻灯片。

   ⚠️ **使用多样化布局**——单调的演示文稿是常见失败模式。不要默认使用基础标题+列表幻灯片。主动寻找：
   - 多栏布局（双栏、三栏）
   - 图片 + 文字组合
   - 全出血图片配文字叠加
   - 引用或标注幻灯片
   - 章节分隔页
   - 数据/数字标注
   - 图标网格或图标+文字行

   **避免：** 每张幻灯片重复相同的文字密集布局。

   将内容类型匹配到布局风格（如：要点 → 列表幻灯片、团队信息 → 多栏、见证 → 引用幻灯片）。

3. **解包**：`python scripts/office/unpack.py template.pptx unpacked/`

4. **构建演示文稿**（自己完成，不使用子代理）：
   - 删除不需要的幻灯片（从 `<p:sldIdLst>` 中移除）
   - 复制要重用的幻灯片（`add_slide.py`）
   - 在 `<p:sldIdLst>` 中重排幻灯片顺序
   - **在第 5 步之前完成所有结构变更**

5. **编辑内容**：更新每个 `slide{N}.xml` 中的文本。
   **如果有子代理，在此处使用**——幻灯片是独立的 XML 文件，子代理可以并行编辑。

6. **清理**：`python scripts/clean.py unpacked/`

7. **打包**：`python scripts/office/pack.py unpacked/ output.pptx --original template.pptx`

---

## 脚本

| 脚本 | 用途 |
|------|------|
| `unpack.py` | 提取并美化打印 PPTX |
| `add_slide.py` | 复制幻灯片或从布局创建 |
| `clean.py` | 移除孤立文件 |
| `pack.py` | 验证并重新打包 |
| `thumbnail.py` | 创建幻灯片可视化网格 |

### unpack.py

```bash
python scripts/office/unpack.py input.pptx unpacked/
```

提取 PPTX，美化打印 XML，转义智能引号。

### add_slide.py

```bash
python scripts/add_slide.py unpacked/ slide2.xml       # 复制幻灯片
python scripts/add_slide.py unpacked/ slideLayout2.xml  # 从布局创建
```

输出 `<p:sldId>` 以添加到 `<p:sldIdLst>` 的目标位置。

### clean.py

```bash
python scripts/clean.py unpacked/
```

移除不在 `<p:sldIdLst>` 中的幻灯片、未引用的媒体、孤立的关系。

### pack.py

```bash
python scripts/office/pack.py unpacked/ output.pptx --original input.pptx
```

验证、修复、压缩 XML、重新编码智能引号。

### thumbnail.py

```bash
python scripts/thumbnail.py input.pptx [output_prefix] [--cols N]
```

生成带幻灯片文件名标签的 `thumbnails.jpg`。默认 3 列，每网格最多 12 张。

**仅用于模板分析**（选择布局）。视觉 QA 请使用 `soffice` + `pdftoppm` 创建全分辨率的单张幻灯片图片——参见 SKILL.md。

---

## 幻灯片操作

幻灯片顺序在 `ppt/presentation.xml` → `<p:sldIdLst>` 中。

**重排**：重新排列 `<p:sldId>` 元素。

**删除**：移除 `<p:sldId>`，然后运行 `clean.py`。

**添加**：使用 `add_slide.py`。永远不要手动复制幻灯片文件——脚本会处理备注引用、Content_Types.xml 和关系 ID，手动复制会遗漏这些。

---

## 编辑内容

**子代理：** 如果可用，在此处使用（完成第 4 步之后）。每张幻灯片是独立的 XML 文件，子代理可以并行编辑。在给子代理的提示中包含：
- 要编辑的幻灯片文件路径
- **"所有修改使用 Edit 工具"**
- 以下格式规则和常见陷阱

对每张幻灯片：
1. 读取幻灯片的 XML
2. 识别所有占位内容——文字、图片、图表、图标、说明
3. 将每个占位替换为最终内容

**使用 Edit 工具，不要用 sed 或 Python 脚本。** Edit 工具强制精确指定替换内容和位置，可靠性更高。

### 格式规则

- **所有标题、副标题和行内标签加粗**：在 `<a:rPr>` 上使用 `b="1"`。包括：
  - 幻灯片标题
  - 幻灯片内的章节标题
  - 行首的内联标签（如："状态："、"描述："）
- **永远不要使用 Unicode 项目符号（•）**：使用 `<a:buChar>` 或 `<a:buAutoNum>` 的正确列表格式
- **项目符号一致性**：让项目符号从布局继承。只指定 `<a:buChar>` 或 `<a:buNone>`。

---

## 常见陷阱

### 模板适配

当源内容的项目数少于模板时：
- **完整移除多余元素**（图片、形状、文本框），不要只清空文字
- 清空文字内容后检查孤立的视觉元素
- 运行视觉 QA 捕捉数量不匹配

替换不同长度的文本时：
- **较短替换**：通常安全
- **较长替换**：可能溢出或意外换行
- 文字修改后进行视觉 QA 测试
- 考虑截断或拆分内容以适应模板的设计约束

**模板槽位 ≠ 源项目数**：如果模板有 4 个团队成员但源数据只有 3 个，删除第 4 个成员的整个组（图片 + 文本框），不只是文字。

### 多项目内容

如果源有多个项目（编号列表、多个部分），为每项创建单独的 `<a:p>` 元素——**永远不要拼接成一个字符串**。

**❌ 错误** — 所有项目在一个段落中：
```xml
<a:p>
  <a:r><a:rPr .../><a:t>Step 1: Do the first thing. Step 2: Do the second thing.</a:t></a:r>
</a:p>
```

**✅ 正确** — 独立段落配粗体标题：
```xml
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 1</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" .../><a:t>Do the first thing.</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 2</a:t></a:r>
</a:p>
<!-- 继续此模式 -->
```

从原始段落复制 `<a:pPr>` 以保留行间距。标题使用 `b="1"`。

### 智能引号

由 unpack/pack 自动处理。但 Edit 工具会将智能引号转为 ASCII。

**添加含引号的新文本时，使用 XML 实体：**

```xml
<a:t>the &#x201C;Agreement&#x201D;</a:t>
```

| 字符 | 名称 | Unicode | XML 实体 |
|------|------|---------|----------|
| `\u201c` | 左双引号 | U+201C | `&#x201C;` |
| `\u201d` | 右双引号 | U+201D | `&#x201D;` |
| `\u2018` | 左单引号 | U+2018 | `&#x2018;` |
| `\u2019` | 右单引号 | U+2019 | `&#x2019;` |

### 其他

- **空白处理**：在含前导/尾随空格的 `<a:t>` 上使用 `xml:space="preserve"`
- **XML 解析**：使用 `defusedxml.minidom`，不要用 `xml.etree.ElementTree`（会破坏命名空间）
