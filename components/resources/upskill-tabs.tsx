"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type UpskillTabsProps = {
  resourcesTab: React.ReactNode;
  qaTab: React.ReactNode;
};

export function UpskillTabs({ resourcesTab, qaTab }: UpskillTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") === "qa" ? "qa" : "resources";

  function handleTabChange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "qa") {
      next.set("tab", "qa");
    } else {
      next.delete("tab");
    }
    const query = next.toString();
    router.replace(`/tools/resources${query ? `?${query}` : ""}`, { scroll: false });
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="resources">Resources</TabsTrigger>
        <TabsTrigger value="qa">Q&amp;A</TabsTrigger>
      </TabsList>
      <TabsContent value="resources">{resourcesTab}</TabsContent>
      <TabsContent value="qa">{qaTab}</TabsContent>
    </Tabs>
  );
}
