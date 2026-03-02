import { oc, type } from "@orpc/contract";

export interface GitStatus {
  branch: string | null;
  ahead: number;
  behind: number;
  changed: number;
}

export const gitContract = {
  status: oc.output(type<GitStatus>()),
};
