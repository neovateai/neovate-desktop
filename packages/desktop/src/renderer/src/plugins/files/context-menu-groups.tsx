import { Fragment } from "react";

import type { MenuGroup } from "./menu-types";

import { ContextMenuItem, ContextMenuSeparator } from "../../components/ui/context-menu";

interface ContextMenuGroupsProps {
  groups: MenuGroup[];
}

export function ContextMenuGroups({ groups }: ContextMenuGroupsProps) {
  return groups.map((group, groupIndex) => (
    <Fragment key={groupIndex}>
      {groupIndex > 0 && <ContextMenuSeparator />}
      {group.map((menuItem, itemIndex) => (
        <ContextMenuItem key={itemIndex} onClick={menuItem.action} data-variant={menuItem.variant}>
          {menuItem.label}
        </ContextMenuItem>
      ))}
    </Fragment>
  ));
}
