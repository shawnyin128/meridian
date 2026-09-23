---
kind: method
title: Error-compensated rounding
aliases: [OBQ-style rounding, second-order rounding, 误差补偿舍入]
parents: []
columns:
  - {key: second_order, label: 用二阶信息}
  - {key: procedure,    label: 过程}
split_on: null
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 | 用二阶信息 | 过程 | 用于 |
|---|---|---|---|
| [[papers/2210.17323|GPTQ]] | 是(近似) ·p1 | 一次性、逐层 ·p1 | [[topics/ptq-weight-only|Weight-only PTQ]] |
| [[papers/2307.13304|QuIP]] | 是(Hessian) ·p1 | 自适应舍入,二次代理目标 ·p1 | [[topics/ptq-weight-only|Weight-only PTQ]] |
<!-- /generated -->
<!-- generated:claims -->
## 结论
(暂无结论)
<!-- /generated -->

## 机制
逐个(或逐列)舍入权重,每舍一个就用二阶信息把误差摊到还没舍入的权重上。不动模型结构,不需要梯度。

## 实验

## 未解决
