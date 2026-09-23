---
kind: method
title: Per-channel scaling
aliases: [equivalent transformation, smoothing, 逐通道缩放]
parents: [methods/outlier-suppression]
columns:
  - {key: scale_from, label: 缩放依据}
  - {key: direction,  label: 迁移方向}
  - {key: learned,    label: 缩放是否学习}
split_on: null
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 | 缩放依据 | 迁移方向 | 缩放是否学习 | 用于 |
|---|---|---|---|---|
| [[papers/2211.10438|SmoothQuant]] | 激活离群值 ·p1 | 激活→权重 ·p1 | 否 ·p1 | [[topics/ptq-weight-activation|Weight-activation PTQ]] |
| [[papers/2306.00978|AWQ]] | 激活分布找显著通道 ·p1 | 放大显著权重通道 ·p1 | 否 ·p1 | [[topics/ptq-weight-only|Weight-only PTQ]] |
| [[papers/2308.13137|OmniQuant]] | 可学习 ·p1 | 激活→权重 ·p1 | 是 ·p1 | [[topics/ptq-weight-only|Weight-only PTQ]], [[topics/ptq-weight-activation|Weight-activation PTQ]] |
<!-- /generated -->
<!-- generated:claims -->
## 结论
(暂无结论)
<!-- /generated -->

## 机制
对每个通道乘一个标量、在相邻的权重里除回去,数学等价。差别只在:标量从哪来(激活统计 / 显著性 / 学出来),以及把难度往哪边挪。

## 实验

## 未解决
