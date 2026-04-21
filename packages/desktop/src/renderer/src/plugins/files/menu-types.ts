export type MenuItem = {
  label: string;
  action: () => void;
  variant?: "destructive";
};

export type MenuGroup = MenuItem[];
