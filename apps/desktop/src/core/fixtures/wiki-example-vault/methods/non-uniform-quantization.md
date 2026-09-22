---
kind: method
title: Non-uniform quantization
aliases: [non-uniform datatypes, dense-and-sparse, 非均匀量化]
parents: []
columns:
  - {key: codebook_from, label: 格点依据}
  - {key: sparse,        label: 离群值稀疏分离}
split_on: null
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 | 格点依据 | 离群值稀疏分离 | 用于 |
|---|---|---|---|
| [[papers/2306.07629|SqueezeLLM]] | 二阶敏感度 ·p1 | 是 ·p1 | [[topics/ptq-weight-only|Weight-only PTQ]] |
| [[papers/2401.18079|KVQuant]] | 逐层敏感度加权 ·p1 | 是(逐向量) ·p1 | [[topics/kv-cache-quantization|KV cache quantization]] |
<!-- /generated -->

## 机制
格点不等距,按敏感度放;放不下的离群值单独存成稀疏矩阵。换来的精度用查表和稀疏 kernel 支付。

## 结论

## 实验

## 未解决
