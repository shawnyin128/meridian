---
kind: method
title: Rotation
aliases: [orthogonal transform, incoherence processing, Hadamard, 旋转]
parents: [methods/outlier-suppression]
columns:
  - {key: rotation_type, label: 旋转类型}
  - {key: learned,       label: 旋转是否学习}
  - {key: applied_to,    label: 施加对象}
split_on: null
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 | 旋转类型 | 旋转是否学习 | 施加对象 | 用于 |
|---|---|---|---|---|
| [[papers/2307.13304|QuIP]] | 随机正交矩阵 ·p1 | 否 ·p1 | 权重与 Hessian ·p1 | [[topics/ptq-weight-only|Weight-only PTQ]] |
| [[papers/2404.00456|QuaRot]] | 旋转(计算不变性) ·p1 | — | 残差、FFN 激活、注意力、KV ·p1 | [[topics/ptq-weight-activation|Weight-activation PTQ]], [[topics/kv-cache-quantization|KV cache quantization]] |
| [[papers/2405.16406|SpinQuant]] | 可学习旋转 ·p1 | 是 ·p1 | 激活或权重矩阵 ·p1 | [[topics/ptq-weight-activation|Weight-activation PTQ]] |
<!-- /generated -->
<!-- generated:claims -->
## 结论
(暂无结论)
<!-- /generated -->

## 机制
乘一个正交矩阵把能量摊到所有维度上,离群通道消失;正交所以可逆、输出不变。差别在:随机还是学出来的,施加在权重还是激活还是 KV。

## 结论
- 2026-09-09 · QuaRot 的旋转是随机的——QuaRot 摘要没写,依据是 SpinQuant 摘要里的 "QuaRot, which applies random rotations"。所以表里 QuaRot 那格留空,由本条补。[[papers/2405.16406]]

## 实验

## 未解决
