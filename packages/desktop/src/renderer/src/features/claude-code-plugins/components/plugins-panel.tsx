import debug from "debug";
import { AlertTriangle, Download, Puzzle, RefreshCw, Search, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  InstalledPlugin,
  Marketplace,
  MarketplacePlugin,
  PluginError,
  PluginUpdate,
} from "../../../../../shared/features/claude-code-plugins/types";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Spinner } from "../../../components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { cn } from "../../../lib/utils";
import { client } from "../../../orpc";
import { claudeCodeChatManager } from "../../agent/chat-manager";
import { useProjectStore } from "../../project/store";
import { DiscoverTab } from "./discover-tab";
import { ErrorsTab } from "./errors-tab";
import { InstalledTab } from "./installed-tab";
import { SourcesTab } from "./sources-tab";

const log = debug("neovate:plugins");

export const PluginsPanel = () => {
  const projects = useProjectStore((s) => s.projects);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [discovered, setDiscovered] = useState<MarketplacePlugin[]>([]);
  const [updates, setUpdates] = useState<PluginUpdate[]>([]);
  const [errors, setErrors] = useState<PluginError[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    log("fetchData");
    try {
      const [inst, mp, disc, upd, err] = await Promise.all([
        client.plugins.listInstalled({}).catch(() => [] as InstalledPlugin[]),
        client.plugins.listMarketplaces({}).catch(() => [] as Marketplace[]),
        client.plugins.discoverAll({}).catch(() => [] as MarketplacePlugin[]),
        client.plugins.checkUpdates({}).catch(() => [] as PluginUpdate[]),
        client.plugins.getErrors({}).catch(() => [] as PluginError[]),
      ]);
      setInstalled(inst);
      setMarketplaces(mp);
      setDiscovered(disc);
      setUpdates(upd);
      setErrors(err);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  const refreshAfterMutation = useCallback(async () => {
    await fetchData();
    const projectPath = useProjectStore.getState().activeProject?.path;
    claudeCodeChatManager.invalidateNewSessions(projectPath);
  }, [fetchData]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const filteredDiscovered = useMemo(() => {
    if (!searchQuery) return discovered;
    const q = searchQuery.toLowerCase();
    return discovered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.keywords?.some((k) => k.toLowerCase().includes(q)),
    );
  }, [discovered, searchQuery]);

  const filteredInstalled = useMemo(() => {
    if (!searchQuery) return installed;
    const q = searchQuery.toLowerCase();
    return installed.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q),
    );
  }, [installed, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-8 flex items-center gap-3 text-foreground">
        <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
          <Puzzle className="size-5 text-primary" />
        </span>
        Plugins
      </h1>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10" />
          <Input
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plugins..."
          />
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>

      <Tabs defaultValue="discover">
        <TabsList variant="underline" className="mb-5">
          <TabsTrigger value="discover">
            <Download className="size-3.5 mr-1.5" />
            Discover
          </TabsTrigger>
          <TabsTrigger value="installed">
            <Puzzle className="size-3.5 mr-1.5" />
            Installed
            {installed.length > 0 && (
              <Badge variant="secondary" size="sm" className="ml-1.5">
                {installed.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sources">
            <Store className="size-3.5 mr-1.5" />
            Sources
          </TabsTrigger>
          <TabsTrigger value="errors">
            <AlertTriangle className="size-3.5 mr-1.5" />
            Errors
            {errors.length > 0 && (
              <Badge variant="destructive" size="sm" className="ml-1.5">
                {errors.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover">
          <DiscoverTab
            plugins={filteredDiscovered}
            marketplaces={marketplaces}
            projects={projects}
            onRefresh={refreshAfterMutation}
          />
        </TabsContent>

        <TabsContent value="installed">
          <InstalledTab
            plugins={filteredInstalled}
            updates={updates}
            projects={projects}
            onRefresh={refreshAfterMutation}
          />
        </TabsContent>

        <TabsContent value="sources">
          <SourcesTab marketplaces={marketplaces} onRefresh={refreshAfterMutation} />
        </TabsContent>

        <TabsContent value="errors">
          <ErrorsTab errors={errors} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
