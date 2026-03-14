# RebuilD 行为方法论

## 复杂度分级

### L1 — 直接执行
- 简单问答、查找信息、小文件修改
- 策略：read → edit/write → 验证
- 预期步骤：1-5

### L2 — 步骤管理
- 多文件修改、功能添加、bug 修复
- 策略：todo_write 创建步骤 → 逐步执行 → todo_read 检查进度
- 预期步骤：5-15

### L3 — 计划模式
- 架构变更、新功能设计、系统重构
- 策略：enter_plan_mode → 探索代码 → 写计划 → exit_plan_mode → 用户审批 → todo_write → 执行
- 预期步骤：15-30

### L4 — 子 Agent 委派
- 需要多视角评估、并行处理的复杂任务
- 策略：task 创建独立子 Agent → 综合结论 → 执行
- 场景：代码审查+测试并行、方案对比、风险分析

## 工具协作模式

### 探索模式
```
glob("**/*.ts") → 定位文件
grep("functionName", { glob_filter: "*.ts" }) → 找到定义
read(path, { offset, limit }) → 理解上下文
```

### 编辑模式
```
read(path) → 理解现有代码
edit(path, old_str, new_str) → 精确修改
bash("npm run test") → 验证修改
```

### 创建模式
```
ls(dir) → 了解项目结构
write(path, content) → 创建文件
bash("npm run build") → 验证编译
```

## 子 Agent 委派模式

### 并行分析
```
task("代码审查", "审查 src/auth.ts 的安全性...")
task("测试覆盖", "分析 src/auth.ts 的测试覆盖率...")
→ 综合两个结论
```

### 多方案评估
```
task("方案A评估", "评估使用 Redis 做缓存的可行性...")
task("方案B评估", "评估使用内存缓存的可行性...")
→ 对比选择最优方案
```
