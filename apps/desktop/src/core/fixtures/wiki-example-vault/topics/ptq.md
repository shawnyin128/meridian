---
kind: topic
title: PTQ
aliases: [post-training quantization, 训练后量化]
parents: [topics/quantization]
columns: []
split_on: 量化对象
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
- [[topics/kv-cache-quantization|KV cache quantization]]
- [[topics/ptq-weight-activation|Weight-activation PTQ]]
- [[topics/ptq-weight-only|Weight-only PTQ]]
<!-- /generated -->
<!-- generated:table -->
## 对照表
(此节点不直接收论文)
<!-- /generated -->
<!-- generated:claims -->
## 结论
(暂无结论)
<!-- /generated -->

## 问题
不重新训练,只用少量或零校准数据把已训练好的模型量化。难点是没有梯度可以修正误差,只能靠变换、舍入策略与格点设计。

按「量化对象」拆成三块:只量权重(内存为主)、权重与激活都量(算子要走整数乘)、只量 KV cache(长上下文内存)。三块的对照表列不同,所以是三个节点。

## 实验

## 未解决
