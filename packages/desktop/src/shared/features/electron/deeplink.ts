export type ParsedDeepLink = {
  action: string;
  params: Record<string, string>;
};

export type DeepLinkAction = "open";

export type DeepLinkPayload = {
  id: string;
  action: DeepLinkAction;
  projectPath: string;
  extras: Record<string, string>;
};

export type DeepLinkOpenRequest = DeepLinkPayload;

export type DeepLinkActionEvent = DeepLinkPayload;

export type DeepLinkProjectReadyAck = {
  id: string;
  projectPath: string;
};
