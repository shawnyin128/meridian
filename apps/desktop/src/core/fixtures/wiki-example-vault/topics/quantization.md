---
kind: topic
title: Quantization
aliases: [模型量化, low-bit inference]
parents: []
columns: []
split_on: 是否重新训练
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
- [[topics/ptq|PTQ]]
- [[topics/qat|QAT]]
<!-- /generated -->
<!-- generated:table -->
## 对照表
(此节点不直接收论文)
<!-- /generated -->

## 问题
把权重、激活、KV cache 用更少的比特表示,换取内存与带宽,同时不让精度掉太多。难点在于低比特下误差不再可忽略,而误差的来源(离群值、舍入、分布不匹配)因场景不同。

这个节点不直接收论文:按「是否重新训练」拆成 PTQ 与 QAT,两边的对照表列完全不同(一边关心校准数据,一边关心训练数据)。

## 结论

## 实验

## 未解决
