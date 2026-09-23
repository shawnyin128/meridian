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
claims:
  - id: "per-channel-keys"
    text: "Key 按通道量化、Value 按 token 量化时,3 bit 的困惑度损失仍在 0.1 以内"
    version: 1
    since: "2026-07-02"
    by: "我"
    evidence:
      - kind: "source"
        paper: "papers/2401.18079"
        page: 1
        quote: "Per-Channel Key Quantization, where we adjust the dimension along which we quantize the Key activations to better match the distribution"
        added: "2026-07-02"
        by: "我"
      - kind: "source"
        paper: "papers/2401.18079"
        page: 1
        quote: "we achieve < 0.1 perplexity degradation with 3-bit quantization on both Wikitext-2 and C4"
        added: "2026-07-02"
        by: "我"
    conflicts:
      - id: "granularity"
        against:
          kind: "claim"
          ref: "topics/ptq-weight-activation#rotation-kv"
        note: "量化粒度的说法不一致:按通道还是按 token"
        since: "2026-08-20"
        by: "我"
  - id: "prefix-schedule"
    text: "KV cache 量化之后,前缀读取与验证可以共调度,吞吐与基线持平"
    version: 2
    since: "2026-08-10"
    by: "我"
    evidence:
      - kind: "personal"
        text: "读 KVQuant 时的直觉"
        added: "2026-07-01"
        by: "我"
      - kind: "experiment"
        project: "fa"
        conclusion: "c1"
        text: "迁移后吞吐与基线持平"
        added: "2026-08-10"
        by: "我"
    history:
      - version: 1
        text: "KV cache 量化会拖慢前缀读取(推测)"
        since: "2026-07-01"
        by: "我"
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
<!-- generated:claims -->
## 结论
- Key 按通道量化、Value 按 token 量化时,3 bit 的困惑度损失仍在 0.1 以内 · v1 · 2026-07-02 ^per-channel-keys
  - 证据 · [[papers/2401.18079|KVQuant]] (p.1)「Per-Channel Key Quantization, where we adjust the dimension along which we quantize the Key activations to better match the distribution」
  - 证据 · [[papers/2401.18079|KVQuant]] (p.1)「we achieve < 0.1 perplexity degradation with 3-bit quantization on both Wikitext-2 and C4」
  - 冲突 · [[topics/ptq-weight-activation#^rotation-kv|旋转之后 KV cache 按 token 量化到 4 bit 就够,不必按通道]]:量化粒度的说法不一致:按通道还是按 token
- KV cache 量化之后,前缀读取与验证可以共调度,吞吐与基线持平 · v2 · 2026-08-10 ^prefix-schedule
  - 个人判断 · 读 KVQuant 时的直觉
  - 证据 · 实验 [[projects/fa|FlashAttention 基线迁移]] c1:迁移后吞吐与基线持平
<!-- /generated -->

## 问题
长上下文下 KV cache 是内存主项,把它压到 4 bit 以下。难点是 Key 的分布沿通道有结构、且经过 RoPE 之后更难量化。

这个节点同时属于 PTQ(手段)和长上下文推理(动机),所以有两个父节点。

## 实验

## 未解决
