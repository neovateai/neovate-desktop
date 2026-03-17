"use client";

import { useState } from "react";

import type { PermissionMode } from "../../../../../shared/features/agent/types";

import { MessageResponse } from "../../../components/ai-elements/message";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "../../../components/ai-elements/plan";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { Radio, RadioGroup } from "../../../components/ui/radio-group";

export type PlanApprovalChoice =
  | { action: "approve"; mode: PermissionMode; clearContext: boolean }
  | { action: "revise"; feedback: string }
  | { action: "dismiss" };

type ApprovalOption = {
  value: string;
  label: string;
  description: string;
  mode: PermissionMode;
  clearContext: boolean;
};

const APPROVAL_OPTIONS: ApprovalOption[] = [
  {
    value: "bypass",
    label: "Yes, bypass permissions",
    description: "YOLO mode — no permission prompts",
    mode: "bypassPermissions",
    clearContext: false,
  },
  {
    value: "autoEdit",
    label: "Yes, auto-approve edits",
    description: "Auto-approve file edits, prompt for other tools",
    mode: "acceptEdits",
    clearContext: false,
  },
  {
    value: "manual",
    label: "Yes, manually approve edits",
    description: "Prompt for all tool usage",
    mode: "default",
    clearContext: false,
  },
  {
    value: "clearContext",
    label: "Yes, clear context & bypass",
    description: "Start fresh session with the plan and bypass permissions",
    mode: "bypassPermissions",
    clearContext: true,
  },
];

const REVISE_VALUE = "revise";

type Props = {
  plan: string;
  onChoice: (choice: PlanApprovalChoice) => void;
};

export function ExitPlanModeRequestDialog({ plan, onChoice }: Props) {
  const [selected, setSelected] = useState("manual");
  const [feedback, setFeedback] = useState("");

  const isRevise = selected === REVISE_VALUE;
  const buttonLabel = isRevise ? "Request Revision" : "Approve";

  const handleSubmit = () => {
    if (isRevise) {
      onChoice({ action: "revise", feedback });
      return;
    }
    const option = APPROVAL_OPTIONS.find((o) => o.value === selected);
    if (!option) return;
    onChoice({ action: "approve", mode: option.mode, clearContext: option.clearContext });
  };

  return (
    <div className="relative rounded-xl border border-border/80 bg-background">
      <Plan defaultOpen>
        <PlanHeader>
          <PlanTitle>Plan to implement</PlanTitle>
          <PlanAction>
            <PlanTrigger />
          </PlanAction>
        </PlanHeader>
        <PlanContent>
          <div className="max-h-[40vh] overflow-y-auto px-4 pb-4">
            <MessageResponse>{plan}</MessageResponse>
          </div>
        </PlanContent>
      </Plan>

      <div className="space-y-3 px-4 py-3">
        <p className="text-sm font-medium text-foreground">Ready to implement?</p>

        <RadioGroup value={selected} onValueChange={setSelected} className="gap-1">
          {APPROVAL_OPTIONS.map((option) => (
            <Label
              key={option.value}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 p-2.5 hover:bg-accent/50 has-data-checked:border-primary/48 has-data-checked:bg-accent/50"
            >
              <Radio value={option.value} />
              <div className="flex flex-col">
                <p className="text-sm text-foreground">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
            </Label>
          ))}

          <Label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 p-2.5 hover:bg-accent/50 has-data-checked:border-primary/48 has-data-checked:bg-accent/50">
            <Radio value={REVISE_VALUE} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col">
                <p className="text-sm text-foreground">Request revision</p>
                <p className="text-xs text-muted-foreground">
                  Send feedback to Claude to revise the plan
                </p>
              </div>
              {isRevise && (
                <textarea
                  placeholder="What should Claude change about this plan?"
                  rows={2}
                  style={{ resize: "none" }}
                  className="mt-2 block w-full rounded-md border border-border/70 bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:ring-1 focus:ring-ring"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              )}
            </div>
          </Label>
        </RadioGroup>

        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onChoice({ action: "dismiss" })}
          >
            Dismiss
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isRevise && !feedback.trim()}>
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
