import type { ExperimentDesign } from './contract.js'

/** The languages a design's idea file is written in, the App's own. */
export type DesignFileLanguage = 'zh' | 'en'

type Substrate = ExperimentDesign['experiment']['substrate']
type LedgerStatus = ExperimentDesign['ledger'][number]['status']

/**
 * The text a person reads in a design's idea file, in each App language. The card in a chat answer
 * takes its section titles and column names from here too, so the file and the card read alike.
 */
export const DESIGN_FILE_TEXT: Record<DesignFileLanguage, {
  sections: { explanations: string; predictions: string; experiment: string; decisions: string; ledger: string; nodes: string }
  columns: {
    regime: string; metric: string; chosen: string; pattern: string; interpretation: string; next: string; state: string
    statement: string; status: string; anchor: string
  }
  experiment: { substrate: string; intervention: string; metric: string; keeps: string; untested: string }
  substrate: Record<Substrate, string>
  ledgerStatus: Record<LedgerStatus, string>
  chosen: string
  unknown: string
  root: string
  projectRoot: (project: string) => string
  under: (project: string, node: string) => string
  hypothesisNode: (claim: string, parent: string) => string
  experimentNode: (regime: string) => string
  noAlternatives: string
  history: (date: string, rows: readonly string[]) => string
  fileName: (id: string) => string
}> = {
  zh: {
    sections: { explanations: '解释', predictions: '预测', experiment: '最小实验', decisions: '决策', ledger: '证据', nodes: 'Lab 节点' },
    columns: {
      regime: '干预', metric: '指标', chosen: '选定', pattern: '结果', interpretation: '解读', next: '下一步', state: '节点',
      statement: '陈述', status: '依据', anchor: '锚点',
    },
    experiment: { substrate: '载体', intervention: '干预', metric: '指标', keeps: '保留', untested: '未测' },
    substrate: { analytic: '解析构造', synthetic: '合成数据', component: '隔离组件', 'small-system': '小系统', 'full-system': '完整系统' },
    ledgerStatus: { source: '来源', inference: '推断', 'new-hypothesis': '新假设' },
    chosen: '是',
    unknown: '未知',
    root: '作为根节点',
    projectRoot: (project) => `作为项目「${project}」的根节点`,
    under: (project, node) => `放在项目「${project}」的节点「${node}」之下`,
    hypothesisNode: (claim, parent) => `1. 假设节点「${claim}」，${parent}。`,
    experimentNode: (regime) => `2. 实验节点「${regime}」，是假设节点的子节点，历史记下这一行：`,
    noAlternatives: '不为 M2 或 M0 建节点；只有决策表的 alternative 一行命中时，才提议 M2 的 alternative 兄弟节点。',
    history: (date, rows) => `${date}：声明决策表：${rows.join('；')}`,
    fileName: (id) => `实验设计-${id}.md`,
  },
  en: {
    sections: {
      explanations: 'Explanations', predictions: 'Predictions', experiment: 'Smallest experiment', decisions: 'Decisions',
      ledger: 'Evidence', nodes: 'Lab nodes',
    },
    columns: {
      regime: 'Intervention', metric: 'Metric', chosen: 'Chosen', pattern: 'Result', interpretation: 'Reading', next: 'Next',
      state: 'Node', statement: 'Statement', status: 'Basis', anchor: 'Anchor',
    },
    experiment: { substrate: 'Substrate', intervention: 'Intervention', metric: 'Metric', keeps: 'Keeps', untested: 'Untested' },
    substrate: {
      analytic: 'Analytic', synthetic: 'Synthetic data', component: 'Isolated component', 'small-system': 'Small system',
      'full-system': 'Full system',
    },
    ledgerStatus: { source: 'Source', inference: 'Inference', 'new-hypothesis': 'New hypothesis' },
    chosen: 'yes',
    unknown: 'Unknown',
    root: 'a root node',
    projectRoot: (project) => `a root node of project "${project}"`,
    under: (project, node) => `under node "${node}" of project "${project}"`,
    hypothesisNode: (claim, parent) => `1. Hypothesis node "${claim}", ${parent}.`,
    experimentNode: (regime) => `2. Experiment node "${regime}", a child of the hypothesis node, with this history line:`,
    noAlternatives: 'No node for M2 or M0. An alternative sibling node for M2 is proposed only when the alternative row of the decision table matches.',
    history: (date, rows) => `${date}: declared decision table: ${rows.join('; ')}`,
    fileName: (id) => `experiment-design-${id}.md`,
  },
}
