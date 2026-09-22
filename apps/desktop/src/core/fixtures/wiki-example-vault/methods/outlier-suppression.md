---
kind: method
title: Outlier suppression
aliases: [离群值抑制]
parents: []
columns: []
split_on: 变换类型(缩放 vs 旋转)
updated: 2026-09-09
---
<!-- generated:children -->
## 子聚合
- [[methods/per-channel-scaling|Per-channel scaling]]
- [[methods/rotation|Rotation]]
<!-- /generated -->
<!-- generated:table -->
## 对照表
(此节点不直接收论文)
<!-- /generated -->

## 机制
在量化之前施加一个不改变模型输出的线性变换,把激活/权重里的离群值摊平。按变换类型拆成两族:逐通道缩放(对角矩阵)与旋转(正交矩阵)。

## 结论

## 实验

## 未解决
