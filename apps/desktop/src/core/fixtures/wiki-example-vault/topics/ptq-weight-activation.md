---
kind: topic
title: Weight-activation PTQ
aliases: [W8A8, W4A4, weight-activation quantization]
parents: [topics/ptq]
columns:
  - {key: bits,            label: 位宽}
  - {key: transform_where, label: 变换施加处}
  - {key: learned,         label: 变换参数是否学习}
  - {key: needs_calib,     label: 需要校准数据}
  - {key: claim,           label: 自述主要结果}
split_on: null
updated: 2026-09-09
claims:
  - id: "rotation-kv"
    text: "旋转之后 KV cache 按 token 量化到 4 bit 就够,不必按通道"
    version: 1
    since: "2026-08-20"
    by: "我"
    evidence:
      - kind: "source"
        paper: "papers/2404.00456"
        page: 1
        quote: "including all weights, activations, and KV cache in 4 bits"
        added: "2026-08-20"
        by: "我"
    conflicts:
      - id: "granularity"
        against:
          kind: "claim"
          ref: "topics/kv-cache-quantization#per-channel-keys"
        note: "量化粒度的说法不一致:按通道还是按 token"
        since: "2026-08-20"
        by: "我"
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 | 位宽 | 变换施加处 | 变换参数是否学习 | 需要校准数据 | 自述主要结果 |
|---|---|---|---|---|---|
| [[papers/2211.10438|SmoothQuant]] | W8A8 ·p1 | 激活→权重的等价缩放 ·p1 | 否 ·p1 | — | 1.56x 提速、2x 省内存 ·p1 |
| [[papers/2308.13137|OmniQuant]] | W4A4 / W6A6 ·p1 | 可学习等价变换(LET) ·p1 | 是 ·p1 | 是,128 样本 ·p1 | W4A4 等多种配置下表现优 ·p1 |
| [[papers/2404.00456|QuaRot]] | W4A4 + KV4 ·p1 | 残差流、FFN 激活、注意力、KV ·p1 | — | 6/8-bit 时不需要 ·p1 | 70B 4-bit 困惑度损失 ≤0.47 ·p1 |
| [[papers/2405.16406|SpinQuant]] | W4A4 + KV4 ·p1 | 激活或权重矩阵的旋转 ·p1 | 是 ·p1 | — | LLaMA-2 7B 零样本差距仅 2.9 点 ·p1 |
<!-- /generated -->
<!-- generated:claims -->
## 结论
- 旋转之后 KV cache 按 token 量化到 4 bit 就够,不必按通道 · v1 · 2026-08-20 ^rotation-kv
  - 证据 · [[papers/2404.00456|QuaRot]] (p.1)「including all weights, activations, and KV cache in 4 bits」
  - 冲突 · [[topics/kv-cache-quantization#^per-channel-keys|Key 按通道量化、Value 按 token 量化时,3 bit 的困惑度损失仍在 0.1 以内]]:量化粒度的说法不一致:按通道还是按 token
<!-- /generated -->

## 问题
权重和激活都量化,矩阵乘才能走整数算子拿到真实加速。难点全在激活:少数通道的离群值把 per-tensor 的量化范围撑大,其余数值精度全丢。

## 结论
- 2026-08-01 · W8A8 用 SmoothQuant 即可,不需要更低比特。[[papers/2211.10438]]
- 2026-09-09 · W4A4 下旋转类优于平滑类:SpinQuant 自述超 SmoothQuant 25.0 点。[[papers/2405.16406]]

## 实验
- 2026-09-09 · Lab exp-0012(示例条目,非真实实验):Llama-3-8B 上复现 QuaRot W4A4,WikiText-2 ppl 6.4;论文未报 8B 数字。[[papers/2404.00456]]

## 未解决
- 旋转与可学习缩放能否叠加:OmniQuant 的 LET 与 SpinQuant 的学习旋转都在学变换,没人同时用。[[papers/2308.13137]] [[papers/2405.16406]]
