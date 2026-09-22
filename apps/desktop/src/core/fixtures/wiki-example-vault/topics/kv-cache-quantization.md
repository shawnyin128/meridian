---
kind: topic
title: KV cache quantization
aliases: [KV 量化, KV cache compression]
parents: [topics/ptq, topics/long-context-inference]
columns:
  - {key: kv_bits,  label: KV 位宽}
  - {key: key_axis, label: Key 量化轴}
  - {key: rope,     label: 相对 RoPE 的位置}
  - {key: claim,    label: 自述主要结果}
split_on: null
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 | KV 位宽 | Key 量化轴 | 相对 RoPE 的位置 | 自述主要结果 |
|---|---|---|---|---|
| [[papers/2401.18079|KVQuant]] | 3 ·p1 | 逐通道 ·p1 | RoPE 之前 ·p1 | 单卡 A100-80GB 上下文到 100 万 ·p1 |
| [[papers/2404.00456|QuaRot]] | 4 ·p1 | — | — | 端到端全 4-bit,无需保留高精度通道 ·p1 |
<!-- /generated -->

## 问题
长上下文下 KV cache 是内存主项,把它压到 4 bit 以下。难点是 Key 的分布沿通道有结构、且经过 RoPE 之后更难量化。

这个节点同时属于 PTQ(手段)和长上下文推理(动机),所以有两个父节点。

## 结论

## 实验

## 未解决
