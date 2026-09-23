---
kind: "topic"
title: "Draft acceptance"
aliases: []
parents: []
columns: []
updated: "2026-05-20"
claims:
  - id: "batch-wins"
    text: "批量 ≥8 且共享前缀时,更宽的树持续净赚"
    version: 1
    since: "2026-08-14"
    by: "ai:skill.meridian"
    evidence:
      - kind: "experiment"
        project: "draft"
        node: "wide"
        text: "B=8/16 的延迟矩阵"
        added: "2026-08-14"
        by: "ai:skill.meridian"
    conflicts:
      - id: "batch"
        against:
          kind: "claim"
          ref: "topics/speculative-decoding#draft-knee"
        note: "批量 + 共享前缀下拐点后移"
        since: "2026-08-14"
        by: "ai:skill.meridian"
---
<!-- generated:children -->
## 子聚合
(无)
<!-- /generated -->
<!-- generated:table -->
## 对照表
| 论文 |
|---|
| [[papers/13979-STAR-Speculative-Decodin|STAR: SPECULATIVE DECODING WITH SEARCHABLE DRAFTING AND TARGET-AWARE REFINEMENT FOR MULTIMODAL GENERATION]] |
<!-- /generated -->
<!-- generated:claims -->
## 结论
- 批量 ≥8 且共享前缀时,更宽的树持续净赚 · v1 · 2026-08-14 ^batch-wins
  - 证据 · 实验 [[projects/draft|draft 效率]] wide:B=8/16 的延迟矩阵
  - 冲突 · [[topics/speculative-decoding#^draft-knee|单请求场景下,draft 树加宽的收益在宽度约 6 处出现拐点]]:批量 + 共享前缀下拐点后移
<!-- /generated -->

## 问题
草稿被接受的比例决定投机解码能省下多少步。

## 实验

## 未解决
