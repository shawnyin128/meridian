---
kind: topic
title: QAT
aliases: [quantization-aware training, 量化感知训练]
parents: [topics/quantization]
columns:
  - {key: bits,  label: 位宽}
  - {key: data,  label: 训练数据}
  - {key: kv,    label: 是否量化 KV}
  - {key: claim, label: 自述主要结果}
split_on: null
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 | 位宽 | 训练数据 | 是否量化 KV | 自述主要结果 |
|---|---|---|---|---|
| [[papers/2305.17888|LLM-QAT]] | 低至 4-bit(权重、激活、KV) ·p1 | 无需原始数据,用模型自生成蒸馏 ·p1 | 是 ·p1 | 低比特下大幅优于免训练方法 ·p1 |
<!-- /generated -->

## 问题
在训练里模拟量化,让模型自己适应低比特。难点是 LLM 的原始训练数据通常拿不到,而且训练成本高。

## 结论

## 实验

## 未解决
