import { oc, type } from "@orpc/contract";

export interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  electronVersion: string;
  appVersion: string;
}

export const systemInfoContract = {
  getInfo: oc.output(type<SystemInfo>()),
};
