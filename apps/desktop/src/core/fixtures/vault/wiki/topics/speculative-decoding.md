---
kind: "topic"
title: "Speculative decoding"
aliases: []
parents: []
columns: []
updated: "2026-05-20"
claims:
  - id: "draft-knee"
    text: "单请求场景下,draft 树加宽的收益在宽度约 6 处出现拐点"
    version: 2
    since: "2026-06-09"
    by: "我"
    evidence:
      - kind: "personal"
        text: "文献里的推测"
        added: "2026-05-02"
        by: "我"
      - kind: "experiment"
        project: "draft"
        node: "knee"
        text: "单请求实测,拐点在宽度 6"
        added: "2026-06-09"
        by: "我"
    conflicts:
      - id: "batch"
        against:
          kind: "claim"
          ref: "topics/draft-acceptance#batch-wins"
        note: "批量 + 共享前缀下拐点后移"
        since: "2026-08-14"
        by: "ai:skill.meridian"
    history:
      - version: 1
        text: "树宽收益递减(文献推测)"
        since: "2026-05-02"
        by: "我"
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
- 单请求场景下,draft 树加宽的收益在宽度约 6 处出现拐点 · v2 · 2026-06-09 ^draft-knee
  - 个人判断 · 文献里的推测
  - 证据 · 实验 [[projects/draft|draft 效率]] knee:单请求实测,拐点在宽度 6
  - 冲突 · [[topics/draft-acceptance#^batch-wins|批量 ≥8 且共享前缀时,更宽的树持续净赚]]:批量 + 共享前缀下拐点后移
<!-- /generated -->

## 问题
小模型起草、大模型并行核对,不改输出分布,省下解码步数。

## 实验

## 未解决
