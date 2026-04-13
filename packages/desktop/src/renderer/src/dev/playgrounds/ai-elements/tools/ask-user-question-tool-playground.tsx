import { useState } from "react";

import { AskUserQuestionTool } from "../../../../features/agent/components/tool-parts/ask-user-question-tool";
import { PlaygroundPage, ScenarioButton } from "../common";

type Scenario = "output-available" | "output-error";

const baseInput = {
  questions: [
    {
      header: "技术方向",
      question: "你最擅长的技术方向是什么？",
      options: [
        { label: "后端开发", description: "更擅长服务端、数据库、接口与系统设计" },
        { label: "前端开发", description: "更擅长 Web、交互、性能与工程化" },
        { label: "全栈开发", description: "前后端都能独立推进，偏综合型" },
        { label: "AI/数据", description: "更擅长 AI 应用、模型集成、数据处理" },
      ],
      multiSelect: false,
    },
    {
      header: "工作年限",
      question: "你的相关工作经验大概有多久？",
      options: [
        { label: "0-1 年", description: "刚入行或经验较少" },
        { label: "2-3 年", description: "有一定项目经验，能独立负责模块" },
        { label: "4-6 年", description: "有较强独立交付能力和一定架构经验" },
        { label: "7 年以上", description: "资深工程师或技术负责人级别" },
      ],
      multiSelect: false,
    },
    {
      header: "重点考察",
      question: "这轮交流你更希望我重点考察哪些方面？",
      options: [
        { label: "编码能力", description: "关注代码质量、实现思路与细节" },
        { label: "系统设计", description: "关注架构设计、权衡与扩展性" },
        { label: "问题排查", description: "关注定位 bug、分析日志与排障能力" },
        { label: "沟通协作", description: "关注需求澄清、跨团队合作与推进方式" },
      ],
      multiSelect: true,
    },
  ],
};

const outputAvailableInvocation = {
  type: "tool-AskUserQuestion",
  toolCallId: "ask-user-question-output-available",
  state: "output-available",
  input: baseInput,
  output: {
    questions: baseInput.questions,
    answers: {
      "你最擅长的技术方向是什么？": "前端开发",
      "你的相关工作经验大概有多久？": "4-6 年",
      "这轮交流你更希望我重点考察哪些方面？": "编码能力, 系统设计",
    },
  },
  providerExecuted: true,
} as any;

const outputErrorInvocation = {
  type: "tool-AskUserQuestion",
  toolCallId: "ask-user-question-output-error",
  state: "output-error",
  input: baseInput,
  errorText: "User cancelled ask user question",
  providerExecuted: true,
} as any;

export function AskUserQuestionToolPlayground() {
  const [scenario, setScenario] = useState<Scenario>("output-available");

  const invocation =
    scenario === "output-error" ? outputErrorInvocation : outputAvailableInvocation;

  return (
    <PlaygroundPage
      title="AskUserQuestionTool"
      summary="Question prompts can now be inspected before and after the user responds."
      scenarioLabel={scenario}
      controls={
        <>
          <ScenarioButton
            active={scenario === "output-available"}
            onClick={() => setScenario("output-available")}
          >
            Output Available
          </ScenarioButton>
          <ScenarioButton
            active={scenario === "output-error"}
            onClick={() => setScenario("output-error")}
          >
            Output Error
          </ScenarioButton>
        </>
      }
    >
      <AskUserQuestionTool invocation={invocation} />
    </PlaygroundPage>
  );
}
