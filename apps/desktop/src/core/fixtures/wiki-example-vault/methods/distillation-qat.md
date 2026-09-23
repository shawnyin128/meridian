---
kind: method
title: Distillation-based QAT
aliases: [data-free QAT, 蒸馏式量化感知训练]
parents: []
columns:
  - {key: teacher, label: 教师}
  - {key: data,    label: 数据来源}
split_on: null
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 | 教师 | 数据来源 | 用于 |
|---|---|---|---|
| [[papers/2305.17888|LLM-QAT]] | 预训练模型自身的生成 ·p1 | 与训练数据无关 ·p1 | [[topics/qat|QAT]] |
<!-- /generated -->
<!-- generated:claims -->
## 结论
(暂无结论)
<!-- /generated -->

## 机制
全精度模型当教师,量化模型当学生,用蒸馏损失训练;数据可以由教师自己生成。示例里只有一篇,lint 会标 thin。

## 实验

## 未解决
