---
kind: topic
title: Weight-only PTQ
aliases: [W4A16, weight-only quantization, 仅权重量化]
parents: [topics/ptq]
columns:
  - {key: bits,        label: 位宽}
  - {key: needs_calib, label: 需要校准数据}
  - {key: backprop,    label: 需要反向传播}
  - {key: claim,       label: 自述主要结果}
split_on: null
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 | 位宽 | 需要校准数据 | 需要反向传播 | 自述主要结果 |
|---|---|---|---|---|
| [[papers/2210.17323|GPTQ]] | W3/W4 · A16 ·p1 | 是(二阶信息) ·p1 | 否 ·p1 | 175B 模型约 4 GPU 小时量化完 ·p1 |
| [[papers/2306.00978|AWQ]] | W4 · A16 ·p1 | 是(离线激活统计) ·p1 | 否 ·p1 | 只保护 1% 显著权重即可大幅降误差 ·p1 |
| [[papers/2306.07629|SqueezeLLM]] | W3 · A16 ·p1 | 是(二阶敏感度) ·p1 | — | 同等内存下困惑度差距缩小 2.1x ·p1 |
| [[papers/2307.13304|QuIP]] | W2 · A16 ·p1 | 是(Hessian) ·p1 | 否 ·p1 | 首个可用的 2-bit 方法 ·p1 |
| [[papers/2308.13137|OmniQuant]] | W4/W3/W2 · A16 ·p1 | 是,128 样本 ·p1 | 是(块级误差最小化) ·p1 | 7–70B 单卡 1–16 小时 ·p1 |
<!-- /generated -->
<!-- generated:claims -->
## 结论
(暂无结论)
<!-- /generated -->

## 问题
只把权重压到 2–4 bit,激活保持 16 bit。目标是省内存与带宽(单批解码是带宽瓶颈),难点是极低比特下的舍入误差与少数敏感权重。

## 结论
- 2026-09-09 · 3-bit 以下,"均匀格点 + 二阶舍入"与"非均匀格点 + 稀疏分离"是两条路,都声称近无损;没有在同一设定下的直接对比。[[papers/2210.17323]] [[papers/2306.07629]] [[papers/2307.13304]]

## 实验

## 未解决
- 2-bit 是否实用:QuIP 说"可用",没说"够用"。[[papers/2307.13304]]
